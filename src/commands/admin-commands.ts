import { Subcommand } from "@sapphire/plugin-subcommands"
import { PlayerModel, Tournament } from "../sequelize/Tournaments.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, codeBlock, ComponentType, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { GenerateTetrioAvatarURL, GetRolesToAddArray, GetTournamentFromGuild, IsTournamentEditable, OrderBy, PlayerDataOrdered, SearchTournamentByNameAutocomplete, TetrioRanksArray } from "../helper-functions/index.js";
import { DeletePlayerFromDatabase } from "../helper-functions/index.js";
import { AsciiTable3 } from "ascii-table3";
import { OrderPlayerListBy } from "../helper-functions/index.js";
import { BuildASCIITableAttachment } from "../helper-functions/index.js";


export class MySlashCommand extends Subcommand {

	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{
					name: 'eliminar-jugador',
					chatInputRun: 'chatInputDeletePlayer'
				},
				{
					name: 'editar-torneo',
					chatInputRun: 'chatInputEditTournamentInfo'
				},
				{
					name: 'listar-jugadores',
					chatInputRun: 'chatInputListaJugadores'
				}
			]
		});
	}


	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder.setName("admin")
				.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
				.setDMPermission(false)
				.setDescription('Varios comandos de utilidad para admins')
				.addSubcommand(deletePlayer =>
					deletePlayer.setName('eliminar-jugador')
						.setDescription('Elimina a un jugador de la base de datos')
						.addUserOption(discorid =>
							discorid.setName('discord-id')
								.setDescription('La id de Discord del usuario que quieres eliminar')
								.setRequired(true)
						)
				)
				.addSubcommand(editTournament =>
					editTournament.setName('editar-torneo')
						.setDescription('Edita la información de un torneo que ya está creado.')
						.addStringOption(name =>
							name.setName('nombre-id')
								.setDescription('El nombre o la Id numérica del torneo')
								.setAutocomplete(true)
								.setMaxLength(255)
						)
						.addStringOption(name =>
							name.setName('nombre')
								.setDescription('El nuevo nombre del torneo')
								.setMaxLength(255)
						)
						.addStringOption(description =>
							description.setName('descripcion')
								.setDescription('La nueva descripción del torneo')
								.setMaxLength(1000)
						)
						.addStringOption(rankCap =>
							rankCap.setName('rank_cap')
								.setDescription('El rank máximo que pueden tener los jugadores (SOLO TETRIO)')
								.setDescriptionLocalizations({
									"en-US": "The highest rank allowed to join this tournament (TETRIO ONLY)"
								})
								.addChoices(...TetrioRanksArray.map(rank => ({ name: rank.toUpperCase(), value: rank })))
						)
						.addIntegerOption(trCap =>
							trCap.setName('tr_cap')
								.setDescription('El cap de TR para este torneo (1 - 25000) (SOLO TETRIO)')
								.setMinValue(1)
								.setMaxValue(25000)
						)
						.addIntegerOption(maxPlayers =>
							maxPlayers.setName('maximo-jugadores')
								.setNameLocalizations({
									"en-US": 'max-players'
								})
								.setDescription('Máximo de jugadores que pueden inscribirse en este torneo')
								.setDescriptionLocalizations({
									"en-US": "Maximum number of players that can join this tournament"
								})
						)
						.addRoleOption(role =>
							role.setName('role-1')
								.setDescription('Rol que quieres añadir a los miembros que se unan a este torneo')
						)
						.addRoleOption(role =>
							role.setName('role-2')
								.setDescription('Rol que quieres añadir a los miembros que se unan a este torneo')
						)
						.addRoleOption(role =>
							role.setName('role-3')
								.setDescription('Rol que quieres añadir a los miembros que se unan a este torneo')
						)
				)
				.addSubcommand(finishTournament =>
					finishTournament.setName('finalizar-torneo')
						.setDescription('Marca un torneo como FINALIZADO')

				)
				.addSubcommand(list =>
					list.setName('listar-jugadores')
						.setDescription('Obtén una lista con los jugadores inscritos en un torneo')
						.addStringOption(name =>
							name.setName('nombre-id')
								.setDescription("El nombre o la Id numérica del torneo")
								.setRequired(true)
								.setAutocomplete(true)
						)
						.addStringOption(order =>
							order.setName('ordenar-por')
								.setDescription('El tipo de ordenamiento de los jugadores en la tabla (SOLO TETRIO)')
								.setChoices(
									{
										name: 'Inscripción',
										value: "default",
									},
									{
										name: 'Rank (e.g: S, S+, SS, X)',
										value: 'rank',
									},
									{
										name: 'Tetra Rating',
										value: 'tr',
									},
									{
										name: 'Ataque Por Minuto (APM)',
										value: 'apm',
									},
									{
										name: 'Piezas Por Segundo (PPS)',
										value: 'pps',
									},
								)

						)
						.addStringOption(format =>
							format.setName('formato')
								.setChoices(
									{
										name: 'ASCII',
										value: 'ascii',
									},
									{
										name: 'Embed',
										value: 'embed'
									},
									{
										name: 'Challonge Friendly',
										value: 'challonge'
									},
									{
										name: "CSV",
										value: "cvs",
									},
									{
										name: 'JSON',
										value: 'json',
									},
								)
								.setDescription('El formato en el que quieres exportar la lista de jugadores')
						)
						.addBooleanOption(checkedin =>
							checkedin.setName('checked-in')
								.setDescription('Filtrar jugadores que hayan hecho Check-in en el torneo')
						)

				)
		}, { idHints: ["1183537285761859665"] })
	}
	public async chatInputDeletePlayer(interaction: Subcommand.ChatInputCommandInteraction) {
		// Your code goes here
		const target = interaction.options.getUser('discord-id', true)
		const player = await PlayerModel.findOne({
			where: {
				discord_id: target.id
			}
		})

		if (!player) return void await interaction.reply({ content: `El usuario ${target.username} no está en la base de datos.` })

		const ConfirmButton = new ButtonBuilder()
			.setCustomId('pl-eliminar')
			.setLabel('Confirmar')
			.setStyle(ButtonStyle.Danger)

		const ConfirmRow = new ActionRowBuilder<ButtonBuilder>()
			.setComponents(ConfirmButton)

		const playerInfo = new EmbedBuilder()
			.setColor(Colors.Red)
			.setDescription(`**Username**: ${player.data.user.username}\n**Rank**: ${player.data.user.league.rank.toUpperCase()}`)

		if (player.data.user.avatar_revision) {
			playerInfo.setThumbnail(GenerateTetrioAvatarURL(player.data.user.username, player.data.user.avatar_revision))
		}

		const initialReply = await interaction.reply({
			content: `¿Estás seguro de que quieres eliminar a este jugador?\nAl confirmar, los datos vinculados a este usuario serán eliminados de la base de datos y el jugador será desinscrito de cualquier torneo en el cual estén inscritos.\nÉsta acción se **cancelará** automáticamente en 60 segundos.`,
			embeds: [playerInfo],
			components: [ConfirmRow],
			ephemeral: true
		})

		const Action = await initialReply.awaitMessageComponent({
			componentType: ComponentType.Button,
			time: 60_000,
			filter: (interaction) => interaction.customId === "pl-eliminar"
		}).catch(_ => null)

		if (!Action) return

		void await Action.update({ content: 'Eliminando al jugador de la base de datos, espera un momento...' })

		const success = await DeletePlayerFromDatabase(target.id)

		const SuccessInfo = new EmbedBuilder()
			.setColor(Colors.Green)
			.setDescription(`Jugador eliminado.\nTorneos afectados: ${success.removed_from_tournaments}`)
			.setTimestamp()

		return void await Action.editReply({
			content: `✅ El jugador ha sido eliminado exitosamente!`,
			embeds: [SuccessInfo],
			components: []
		})
	}

	/** This is essentially an UPDATE request */
	public async chatInputEditTournamentInfo(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {

		const tournamentId = +interaction.options.getString('nombre-id', true)

		if (isNaN(tournamentId))
			return void await interaction.reply({
				content: 'La id del torneo debe ser una id numérica o una de las opciones del autocompletado.',
				ephemeral: true
			})


		// Try to get the tournament from this guild
		const tournament = await GetTournamentFromGuild(interaction.guildId, tournamentId)

		if (!tournament) {
			return void await interaction.reply({
				content: 'Esta guild no tiene ningún torneo con esa id.',
				ephemeral: true
			})
		}

		if (!IsTournamentEditable(tournament))
			return void await interaction.reply({
				content: 'No puedes editar la información de este torneo por que está marcado como **TERMINADO**',
				ephemeral: true
			})

		const options = {
			name: interaction.options.getString('nombre', false),
			description: interaction.options.getString('descripcion', false),
			rankCap: interaction.options.getString('rank_cap', false),
			trCap: interaction.options.getInteger('tr_cap', false),
			maxPlayers: interaction.options.getInteger('maximo-jugadores', false)
		}

		if (options.name) tournament.name = options.name
		if (options.description) tournament.description = options.description

		if (options.rankCap) {
			tournament.rank_cap = options.rankCap
			tournament.is_rank_capped = true
		}

		if (options.trCap) {
			tournament.tr_cap = options.trCap
			tournament.is_tr_capped = true
		}

		if (options.maxPlayers) tournament.max_players = options.maxPlayers

		const newRoles = GetRolesToAddArray(interaction)

		if (newRoles.length > 0) {
			// We are just gonna replace the old roles with the new ones
			tournament.add_roles = newRoles
		}


		// Update the tournament in the database
		await tournament.save()

		return void await interaction.reply({
			content: `¡El torneo **${tournament.name}** (id ${tournament.id}) ha sido editado con éxito!`,
			ephemeral: false
		})
	}

	public async chatInputListaJugadores(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const idTorneo = +interaction.options.getString('nombre-id', true)

		if (isNaN(idTorneo))
			return void await interaction.reply({ content: 'Debes ingresar la id numérica de un torneo o **usar una de las opciones del autocompletado**.' })

		const tournament = await GetTournamentFromGuild(interaction.guildId, idTorneo)
		if (!tournament) return void await interaction.reply({ content: 'Este torneo no existe.', ephemeral: true })


		const format = interaction.options.getString('formato', false) ?? "ascii" // default ascii

		if (tournament.game !== "TETRIO") return void await interaction.reply({ content: 'El listado de jugadores para torneos que no son de tetrio se implementará prontamente.', ephemeral: true })
		// We basically need to skip all the code below if the tournament is not a TETRIO tournament

		if (format === 'ascii') BuildASCIITableAttachment(interaction, tournament)

		if (format === 'challonge') void await interaction.reply({ content: 'Este formato aún no está implementado.', ephemeral: true })

		if (format === 'csv') void await interaction.reply({ content: 'Este formato aún no está implementado.', ephemeral: true })

		if (format === 'embed') SendListOfPlayersEmbed(interaction, tournament)

		if (format === 'json') void await interaction.reply({ content: 'Este formato aún no está implementado.', ephemeral: true })
	}

	public async autocompleteRun(interaction: Subcommand.AutocompleteInteraction<'cached'>) {

		if (interaction.options.getFocused(true).name === 'nombre-id') {
			return void await SearchTournamentByNameAutocomplete(interaction)
		}
	}
}


async function SendListOfPlayersEmbed(interaction: Subcommand.ChatInputCommandInteraction, tournament: Tournament) {
	void await interaction.deferReply()

	const orderBy = interaction.options.getString('ordenar-por', false) as OrderBy ?? 'default'

	let orderedPlayerList: PlayerDataOrdered[]

	if (!interaction.options.getBoolean('checked-in', false)) {
		orderedPlayerList = await OrderPlayerListBy(tournament.players, orderBy)
	} else {
		orderedPlayerList = await OrderPlayerListBy(tournament.checked_in, orderBy)
	}

	const table = new AsciiTable3()
		.setHeading("POS", "USERNAME", "RANK", "RATING")
		.setAlignCenter(1)
		.setAlignCenter(2)
		.setAlignCenter(3)

	let pos = 1
	for (const player of orderedPlayerList) {
		table.addRow(pos, player.data.user.username, player.data.user.league.rank.toUpperCase(), player.data.user.league.rating.toFixed(2))
		pos++
	}

	const playersEmbed = new EmbedBuilder()
		.setTitle(tournament.name)
		.setDescription(
			codeBlock(
				table.toString()
			)
		)

	return void await interaction.editReply({ content: 'Aquí está la lista de jugadores', embeds: [playersEmbed] })
}