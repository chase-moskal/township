
import {v2, V2} from "@benev/toolbox/x/utils/v2.js"
import {Randy} from "@benev/toolbox/x/utils/randy.js"

export class Simulation<S extends {}> {

	// TODO implement incredible interface that provides the behavior function for defining behaviors
	// where the key is to accept the "for" selector with 'keyof' type,
	// and use that to pick from S to determine the "state" type
	// (thus the state object has the fields specified in the '.for' selector)
	system: any

	// TODO implement entities as an object that wraps a Map<id, Partial<State>> and provides some basic functions
	entities: any
}

export type State = {
	health: number
	position: V2
	mode: {type: "wander"} | {type: "attack", target: number} | {type: "dead"}
	sight_range: number
	weapon: {
		damage: number
		range: number
	}
}

const simulation = new Simulation<State>()

const system = simulation.system("overlord", (behavior: any) => {
	const randy = Randy.seed(1)

	function get_entity(id: number) {
		return simulation.entities.get(id)
	}

	function get_nearest_drone(except: number, position: V2) {
		let nearest: undefined | {id: number, distance: number, state: State} = undefined

		for (const [id, state] of simulation.entities) {
			if (id === except)
				continue

			const distance = v2.distance(position, state.position)

			if (!nearest || distance < nearest.distance)
				nearest = {id, state, distance}
		}

		return nearest
	}

	function get_entity_at_position([x, y]: V2) {
		for (const [id, state] of simulation.entities) {
			if (state.position[0] === x && state.position[1] === y)
				return {id, state}
		}
	}

	return [

		behavior("wandering movement")
			.for("position", "mode")
			.effect(({state}: any) => {
				if (state.mode.type === "wander") {
					const [ox, oy] = state.position
					const dx = randy.choose([-1, 0, 1]);
					const dy = randy.choose([-1, 0, 1]);
					const new_position: V2 = [ox + dx, oy + dy]
					if (!get_entity_at_position(new_position))
						state.position = new_position
				}
			}),

		behavior("attack pursuit movement")
			.for("position", "mode")
			.effect(({state}: any) => {
				if (state.mode.type === "attack") {
					const [ax, ay] = state.position
					const [bx, by] = get_entity(state.mode.target).position
					const dx = Math.sign(bx - ax)
					const dy = Math.sign(by - ay)
					const new_position = v2.add(state.position, [dx, dy])
					if (!get_entity_at_position(new_position))
						state.position = new_position
				}
			}),

		behavior("acquire target when in proximity")
			.for("position", "mode", "sight_range")
			.effect(({state, id}: any) => {
				if (state.mode.type === "wander") {
					const nearest = get_nearest_drone(id, state.position)
					if (nearest && nearest.distance < state.sight_range) {
						state.mode = {type: "attack", target: nearest.id}
					}
				}
			}),

		behavior("attack!")
			.for("position", "stats")
			.effect(({state}: any) => {
				if (state.mode.type === "attack") {
					const target = get_entity(state.mode.target)
					const distance = v2.distance(state.position, target.position)
					if (distance < state.weapon.range)
						target.health -= state.weapon.damage
				}
			}),

		behavior("fatality")
			.for("health")
			.effect(({state}: any) => {
				if (state.mode.type !== "dead" && state.health <= 0)
					state.mode = {type: "dead"}
			}),
	]
})

