import { logIt } from '../common'
import { Alignment } from '../modules/enums';
import { PointType } from '../modules/geometry';

// Used to validate if a string is a single numeric value. Accepts leading sign, base prefix (0x/0b/0o), decimals, and exponential notation.
const NUMBER_VALIDATION_REGEX = new RegExp(/^[+-]?(?:0[xbo])?\d+(?:\.\d*)?(?:e[+-]?\d+)?$/);

/** Evaluates a numeric expression within an arbitrary string. Returns zero if evaluation fails or value string was empty.
    Note that the number formats must be "language neutral," meaning always period for decimal separator and no thousands separators. */
export function evaluateValue(value: string): number {
    if (!value)
        return 0
    try {
        // First try parsing the string as a single number. Even using a regex check this is still ~6x faster overall for single numeric values.
        // For expressions there's a little unnecessary overhead but it's fractions of a percent difference since the regex is fast.
        // Unfortunately we can't just call Number() or parseFloat() first, and check for NaN return,
        // because they'll return any number at the start of a string and ignore the rest (eg from "2 + 2" they return 2).
        // Use Number() c'tor vs. parseFloat() because it also handles base prefixes (0x/0b/0o).
        if (NUMBER_VALIDATION_REGEX.test(value))
            return Number(value) || 0;

        // If it's not just a plain number then evaluate it as an expression.
        return (new Function( `"use strict"; return (${value})`))() || 0;
    }
    catch (e) {
        logIt("WARN", "Error evaluating the numeric expression '" + value + "':", e)
        return 0
    }
}

/** Decodes/converts/evaluates a text string sent from TP action data.
    TP sends all '\' escape sequences with '\\' so they no longer work automatically (\n, \t, \uNNNN). The Function trick with backticks resolves all that.
    This also allows embedding interpolated values into a string!  Eg. user can send: "2 + 2 = ${2+2}" which will run the calculation in brackets.
    It even works with TP values embedded inside the {...} part, eg. "Half of a global TP Value = ${${value:dynamic_icon_value_2} / 2}"
*/
export function evaluateStringValue(value: string): string {
    try {
        return (new Function('return `' + value + '`')());
    }
    catch (e) {
        logIt("WARN", "Error evaluating the string expression '" + value + "':", e)
        return value
    }
}

/** Parses a string of CSV numbers and inserts them into given `dest` array. Destination array is _not_ cleared first.
    Each individual value in the list is run through `evaluateValue()` function, allowing math, etc.
    Commas inside parenthesis are ignored as separators, allowing use of functions which take multiple arguments.
    e.g. "(45 * Math.PI / 2), 20, Math.pow(8, 10)" would result in an array of three values.
    If evaluation fails for a value then a zero is used instead (see also `evaluateValue()`).
    If `maxCount` is not zero then only up to this many values will be parsed.
    Values can be optionally filtered by min/max range. Invalid values are silently skipped.
    Returns `true` if any _non-zero_ members were added, `false` otherwise.
*/
export function parseNumericArrayString(
    value: string,
    dest: Array<number>,
    maxCount: number = 0,
    minValue: number = -Number.MAX_VALUE,
    maxValue: number = Number.MAX_VALUE
) : boolean
{
    let ret: boolean = false,
        i: number = 0,
        v: string;
    for (v of value.split(/,(?<!\([^)]*)/g)) {
        const val = evaluateValue(v);
        if (!Number.isNaN(val) && val >= minValue && val <= maxValue) {
            dest.push(val);
            if (!ret && val)
                ret = true;
        }
        if (maxCount && ++i == maxCount)
            break;
    }
    return ret;
}

/** Parses and evaluates up to two values out of a string. e.g. "(45 * Math.PI / 2), 20"
    Results are assigned to the returned Vect2d's `x` and `y` members respectively.
    If only one value is found in the string then it is assigned to the result's `y` member as well as to `x`.
    An empty value string produces a default zero-length vector.
    See also `parseNumericArrayFromValue()`
*/
export function parsePointFromValue(value: string): PointType {
    const ret: PointType = {x: 0, y: 0},
        valPr = [];
    if (parseNumericArrayString(value, valPr, 2)) {
        ret.x = valPr[0];
        ret.y = valPr.length > 1 ? valPr[1] : ret.x;
    }
    return ret;
}

/** Parses a string value into an Alignment enum type result and returns it.
    Accepted string values (brackets indicate the minimum # of characters required):
        Horizontal: "[l]eft", "[c]enter", "[r]ight", "[j]ustify"
        Vertical:   "[t]op", "[m]iddle", "[b]ottom", "[ba]seline"
    Which direction(s) to evaluate can be specified in the `atype` parameter as one of the alignment type masks.
 */
export function parseAlignmentFromValue(value: string, atype: Alignment = Alignment.H_MASK | Alignment.V_MASK): Alignment {
    let ret: Alignment = Alignment.NONE;

    if (atype & Alignment.H_MASK) {
        // "left", "center", "right", "justify"
        switch (value[0]) {
            case 'c':
                ret |= Alignment.HCENTER;
                break;
            case 'l':
                ret |= Alignment.LEFT;
                break;
            case 'r':
                ret |= Alignment.RIGHT;
                break;
            case 'j':
                ret |= Alignment.JUSTIFY;
                break;
        }
    }
    if (atype & Alignment.V_MASK) {
        // "top", "middle", "bottom", "baseline"
        switch (value[0]) {
            case 'm':
                ret |= Alignment.VCENTER;
                break;
            case 't':
                ret |= Alignment.TOP;
                break;
            case 'b':
                ret |= (value[1] == 'a' ? Alignment.BASELINE : Alignment.BOTTOM);
                break;
        }
    }
    return ret;
}
