
import {v2, V2} from "@benev/toolbox/x/utils/v2.js"
import {Randy} from "@benev/toolbox/x/utils/randy.js"

export type Effect<S extends {}> = ({}: {state: S, id: number}) => void

export type Behavior<S extends {}> = {
	name: string
	selector: (keyof S)[]
	effect: Effect<S>
}

export type BehaviorFun<S extends {}> = (name: string) => ({
	for: <K extends keyof S>(...selector: K[]) => ({
		effect: (e: Effect<Pick<S, K>>) => Behavior<Pick<S, K>>,
	}),
})

export class Entities<S extends {}> {
	#last_id = 0
	get #id() { return this.#last_id++ }

	#states = new Map<number, Partial<S>>()

	#match = (
		(selector: (keyof S)[], state: Partial<S>) =>
			selector.every(s => Object.keys(state).includes(s as string))
	)

	add(state: Partial<S>) {
		const id = this.#id
		this.#states.set(id, state)
	}

	remove(id: number) {
		this.#states.delete(id)
	}

	*query<K extends keyof S>(...selector: K[]) {
		for (const entry of this.#states.entries())
			if (this.#match(selector, entry[1]))
				yield entry as [number, Pick<S, K>]
	}

	get all() {
		return this.#states.entries()
	}

	get<T extends Partial<S>>(id: number) {
		return this.#states.get(id) as undefined | T
	}
}

export type Systems<S extends {}> = {
	[name: string]: (b: BehaviorFun<S>) => Behavior<S>[]
}

export class Simulation<S extends {}> {
	#systems: {name: string, behaviors: Behavior<S>[]}[] = []

	entities = new Entities<S>()

	system(name: string, fun: (b: BehaviorFun<S>) => Behavior<S>[]) {
		this.#systems.push({
			name,
			behaviors: fun(
				name => ({
					for: (...selector) => ({
						effect: effect => ({
							name,
							selector,
							effect,
						})
					}),
				})
			),
		})
	}
}

export type State = {
	health: number
	position: V2
	sight_range: number
	weapon: {
		damage: number
		range: number
	}
	mode: (
		| {type: "wander"}
		| {type: "attack", target: number}
		| {type: "dead"}
	)
}

const simulation = new Simulation<State>()

simulation.system("overlord", behavior => {
	const randy = Randy.seed(1)

	function get_entity<K extends keyof State>(id: number) {
		return simulation.entities.get(id) as undefined | Pick<State, K>
	}

	function get_nearest_drone(except: number, position: V2) {
		let nearest: undefined | {
			id: number,
			distance: number,
			state: Pick<State, "position"> | Partial<State>,
		} = undefined

		for (const [id, state] of simulation.entities.query("position")) {
			if (id === except)
				continue

			const distance = v2.distance(position, state.position)

			if (!nearest || distance < nearest.distance)
				nearest = {id, distance, state}
		}

		return nearest
	}

	function get_entity_at_position([x, y]: V2) {
		for (const [id, state] of simulation.entities.query("position")) {
			if (state.position[0] === x && state.position[1] === y)
				return {id, state}
		}
	}

	return [

		behavior("wandering movement")
			.for("position", "mode")
			.effect(({state}) => {
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
			.effect(({state}) => {
				if (state.mode.type === "attack") {
					const [ax, ay] = state.position
					const [bx, by] = get_entity<"position">(state.mode.target)!.position
					const dx = Math.sign(bx - ax)
					const dy = Math.sign(by - ay)
					const new_position = v2.add(state.position, [dx, dy])
					if (!get_entity_at_position(new_position))
						state.position = new_position
				}
			}),

		behavior("acquire target when in proximity")
			.for("position", "mode", "sight_range")
			.effect(({state, id}) => {
				if (state.mode.type === "wander") {
					const nearest = get_nearest_drone(id, state.position)
					if (nearest && nearest.distance < state.sight_range)
						state.mode = {type: "attack", target: nearest.id}
				}
			}),

		behavior("attack!")
			.for("position", "mode", "weapon")
			.effect(({state}) => {
				if (state.mode.type === "attack") {
					const target = get_entity<"position" | "health">(state.mode.target)!
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

