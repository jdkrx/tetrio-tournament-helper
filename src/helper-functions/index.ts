/**
* This file will contain tetrio api function calls
* and maybe other stuff.
*/
import { EmbedBuilder, Colors } from "discord.js";
import { request } from "undici"
import { Tournament, TournamentStatus } from "../sequelize/index.js";
import { PlayerModel } from "../sequelize/index.js";
import { Subcommand } from "@sapphire/plugin-subcommands";
import { TournamentModel } from "../sequelize/index.js";

export type TetrioApiCacheStatus = "hit" | "miss" | "awaited"
export type TetrioUserRole = "anon" | "user" | "bot" | "halfmod" | "mod" | "admin" | "sysop" | "banned"

export interface TetrioUserData {
	user: {
		_id: string;
		username: string;
		role: TetrioUserRole;
		ts?: string;
		botmaster?: string;
		badges?: {
			id: string;
			label: string;
			ts?: string;
		}[],
		xp: number;
		gamesplayed: number;
		gameswon: number;
		gametime: number;
		country: string | null;
		badstanding: boolean;
		supporter: boolean;
		/** between 0 - 4 inclusive */
		supporter_tier: number;
		verified: boolean;
		/** Tetra League stats */
		league: {
			gamesplayed: number;
			gameswon: number;
			rating: number;
			rank: string;
			bestrank: string;
			standing: number;
			standing_local: number;
			next_rank: string | null;
			prev_rank: string | null;
			next_at: number;
			prev_at: number;
			percentile: number;
			glicko?: number;
			rd?: number;
			apm?: number;
			pps?: number;
			vs?: number;
			decaying: boolean;
		}
		/** This user's avatar ID. Get their avatar at https://tetr.io/user-content/avatars/{ USERID }.jpg?rv={ AVATAR_REVISION } */
		avatar_revision?: number;
		/** This user's banner ID. Get their banner at https://tetr.io/user-content/banners/{ USERID }.jpg?rv={ BANNER_REVISION }. Ignore this field if the user is not a supporter. */
		banner_revision?: number;
		/** About me */
		bio?: string;
		connections: {
			discord?: {
				id: string;
				username: string;
			}
		}
		friend_count: number;
		distinguishment?: {
			type: string;
		}
	}
}

interface APIUserResponse {
	success: boolean;
	error?: string;
	cache?: {
		status: TetrioApiCacheStatus;
		cached_at: number;
		cached_until: number;
	},
	data?: TetrioUserData;
}

const TETRIO_BASE = "https://ch.tetr.io/api"
const TETRIO_ENDPOINTS = {
	users: TETRIO_BASE + "/users/",
}
export const TetrioRanksArray = ["z", "d", "d+", "c-", "c", "c+", "b-", "b", "b+", "a-", "a", "a+", "s-", "s", "s+", "ss", "u", "x"] as const

const CreateRanksMap = (ranks: typeof TetrioRanksArray) => {
	let i = 0;
	const tempMap = new Map<string, number>()
	for (const rank of ranks) {
		tempMap.set(rank, i)
		i++
	}

	return tempMap
}

export const TetrioRanksMap: Map<string, number> = CreateRanksMap(TetrioRanksArray)

/** Gets data of an user from the TETRIO API, calls toLowerCase() internally */
export async function GetUserDataFromTetrio(_username: string): Promise<TetrioUserData | null> {
	try {
		const username = _username.toLowerCase();

		const apiResponse = await request(TETRIO_ENDPOINTS.users + username).then(response => response.body.json()) as APIUserResponse;

		if (!apiResponse.success) return null;

		/** apiResponse.data shouldn't be undefined here since the request succeeded */
		return apiResponse.data!

	} catch (e) {
		console.log(e);
		return null;
	}
}

/** avatar_revision? (int) - This user's avatar ID.
	* Get their avatar at https://tetr.io/user-content/avatars/{ USERID }.jpg?rv={ AVATAR_REVISION }
	*
	*/
export function GenerateTetrioAvatarURL(userId: string, avatar_revision: number | undefined) {

	if (!avatar_revision) return null;
	return `https://tetr.io/user-content/avatars/${userId}.jpg?rv=${avatar_revision}`
}

export function GetUserProfileURL(username: string) {
	return `https://ch.tetr.io/u/${username}`
}

export function TournamentIsJoinableByTetrioPlayer(playerData: TetrioUserData, caps: { rank_cap?: string; tr_cap?: number; country_lock?: string }) {
}

export function TournamentDetailsEmbed(torneo: Tournament) {

	const players = torneo.players
	console.log(`[DEBUG] PLAYERS ARRAY =>`, players)

	return (
		new EmbedBuilder()
			/** This probably will need change if later i want to implement more statuses. */
			.setTitle(`${torneo.name} (${torneo.status === 0 ? "CLOSED" : "OPEN"})`)
			.setDescription(
				`**ID del torneo**: ${torneo.id}` +
				`\n**Organizado por**: <@${torneo.organized_by}>` +
				`\n**Juego**: ${torneo.game}` +
				`${torneo.is_tr_capped ? `\n**TR CAP**: ${torneo.tr_cap}` : ""}` +
				`${torneo.is_rank_capped ? `\n**RANK CAP**: ${torneo.rank_cap}` : ""}` +
				`${torneo.is_country_locked ? `\n**COUNTRY LOCK**: ${torneo.country_lock}` : ""}` +
				`\n**Jugadores registrados**: ${players.length}`
			)
			.setColor(Colors.White)
			.setTimestamp()
	)
}

export async function AddTetrioPlayerToDatabase({ discordId, tetrioId }: { discordId: string; tetrioId: string; }, userData: TetrioUserData) {

	if (!discordId || !tetrioId)
		throw new Error(`Missing one of the arguments. dId: ${discordId}, tId: ${tetrioId}`);


	console.log("[DEBUG] Añadiendo nuevo PLAYER a la base de datos...");

	await PlayerModel.create({
		discord_id: discordId,
		tetrio_id: tetrioId,
		data: userData
	});

	console.log(`[PLAYERS DATABASE] => Player (${discordId}) - ${tetrioId} se ha guardado en la base de datos.`);

}
export async function RunTetrioTournamentRegistrationChecks(userData: TetrioUserData, torneo: Tournament, discordId: string): Promise<{ allowed: boolean; reason?: string; }> {

	if (torneo.status === TournamentStatus.CLOSED) {
		return ({ allowed: false, reason: "Las inscripciones para este torneo no se encuentran abiertas." })
	}

	// In here we have to check for Tetrio caps like rank, rating and country lock and if the player is already on the tournament.
	if (torneo.players.includes(discordId)) {
		return ({ allowed: false, reason: "Ya te encuentras en la lista de participantes de este torneo." });
	}

	if (torneo.is_country_locked && torneo.country_lock?.toUpperCase() !== userData.user.country?.toUpperCase()) {
		// The country of the player doesn't match the tournament country lock
		return ({ allowed: false, reason: "El pais del jugador es distinto al pais del torneo." });
	}

	if (torneo.is_tr_capped) {
		if (userData.user.league.rank === 'z')
			return ({ allowed: false, reason: "El jugador no posee un rank actualmente." });


		if (userData.user.league.rating > torneo.tr_cap!) {
			return ({ allowed: false, reason: "El rating del jugador está por sobre el limite de TR del torneo." });
		}
	}

	if (torneo.is_rank_capped) {

		if (userData.user.league.rank === 'z')
			return ({ allowed: false, reason: "El jugador es actualmente UNRANKED en Tetra League." });

		const tournamentRankIndex = TetrioRanksArray.findIndex((rank) => rank === torneo.rank_cap);
		const userRankIndex = TetrioRanksArray.findIndex((rank) => rank === userData.user.league.rank);

		if (tournamentRankIndex < userRankIndex)
			return ({ allowed: false, reason: "El rank del jugador está por sobre el límite de rank impuesto por el torneo." });
	}

	if (torneo.max_players && torneo.players.length >= torneo.max_players) {
		return ({ allowed: false, reason: "El torneo ha alcanzado el máximo de participantes." });
	}

	return { allowed: true };
}

/** This function handles the autocomplete entirely */
export async function SearchTournamentByNameAutocomplete(interaction: Subcommand.AutocompleteInteraction) {
	const focusedOption = interaction.options.getFocused(true)

	if (focusedOption.name === 'nombre-torneo') {
		/** This should be okay for now, since we will probably not have too many tournaments stored */
		const torneos = await TournamentModel.findAll()

		return void await interaction.respond(
			torneos.filter(torneo => torneo.name.toLowerCase().includes(
				focusedOption.value.toLowerCase()
			)).map(torneo => ({ name: torneo.name, value: torneo.id.toString() }))
		)
	}
}

export async function SearchTournamentById(id: number) {
	return await TournamentModel.findOne({ where: { id } })
}

