
import {Suite, expect} from "cynic"

export default <Suite>{
	"test suite runs": async() => {
		expect(1).equals(1)
	},
}

