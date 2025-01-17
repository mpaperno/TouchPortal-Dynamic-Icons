import { PointType, Point, Size, SizeType, Vect2d } from './';

export default class Rectangle
{
    origin: Vect2d = new Vect2d();
    size: Size =  new Size();

    constructor();
    constructor(origin: PointType, size: SizeType);
    constructor(origin: PointType, width: number, height: number);
    constructor(top: number, left: number, size: SizeType);
    constructor(top: number, left: number, width: number, height: number);
    // implementation
    constructor(xOrOrigin?: number | PointType, yOrSize?: number | SizeType, wOrSize?: number | SizeType, h?: number) {
        if (xOrOrigin == undefined)
            return;
        if (typeof xOrOrigin == "object")
            Point.set(this.origin, xOrOrigin);
        else
            Point.set(this.origin, xOrOrigin, (typeof yOrSize == "number" ? yOrSize : undefined));

        if (typeof (yOrSize) === "object")
            Size.set(this.size, yOrSize.width, yOrSize.height);
        else if (wOrSize == undefined)
            return;
        else if (typeof (wOrSize) === "object")
            Size.set(this.size, wOrSize.width, wOrSize.height);
        else
            Size.set(this.size, wOrSize, h);
    }

    clone(): Rectangle {
        return new Rectangle(this.origin, this.size);
    }

    toString(): string {
        return `${this.constructor.name}(${this.x},${this.y} ${this.width}x${this.height})`;
    }

    /** Creates a new instance of Rectangle with origin(0,0) and the given size for width and height. */
    static fromSize(size: SizeType): Rectangle {
        return new Rectangle(0, 0, size.width, size.height);
    }

    get x() { return this.origin.x; }
    set x(x: number) { this.origin.x = x; }
    get y() { return this.origin.y; }
    set y(y: number) { this.origin.y = y; }
    get width() { return this.size.width; }
    set width(w: number) { this.size.width = w; }
    get height() { return this.size.height; }
    set height(h: number) { this.size.height = h; }

    get top()    { return this.height < 0 ? this.y + this.height : this.y; }
    get right()  { return this.width  < 0 ? this.x : this.x + this.width; }
    get bottom() { return this.height < 0 ? this.y : this.y + this.height; }
    get left()   { return this.width  < 0 ? this.x + this.width : this.x; }

    /** Returns true if either of the width or height are less than or equal to zero. */
    get isEmpty() { return this.size.isEmpty; }
    /** Returns true if both the width or height are zero. */
    get isNull() { return this.size.isNull; }

    /** Clones this Rectangle, adds `origin` to both origin coordinates and `size` to both size coordinates, and returns the new instance.  */
    adjusted(origin: number | PointType, size: number | SizeType): Rectangle;
    /** Clones this Rectangle, adds `origin` to both origin coordinates and `right` and `bottom` to size coordinates, and returns the new instance. */
    adjusted(origin: number | PointType, right: number, bottom: number): Rectangle;
    /** Adds given offsets to a copy of this rectangle and returns the copy. */
    adjusted(left: number, top: number, right: number, bottom: number): Rectangle;
    // implementation
    adjusted(leftOrOffs: number | PointType, topOrRtOrSz: number | SizeType, rtOrBot?: number, bottom?: number): Rectangle {
        return Rectangle.adjust(this.clone(), leftOrOffs, topOrRtOrSz, rtOrBot, bottom);
    }

    /** Adds `origin` to both origin coordinates and `size` to both size coordinates of this instance and returns itself. */
    adjust(origin: number | PointType, size: number | SizeType): Rectangle;
    /** Adds `origin` to both origin coordinates and `right` and `bottom` to size coordinates of this instance and returns itself. */
    adjust(origin: number | PointType, right: number, bottom: number): Rectangle;
    /** Adds given values to this rectangle's coordinates and returns this instance. */
    adjust(left: number, top: number, right: number, bottom: number): Rectangle;
    // implementation
    adjust(leftOrOffs: number | PointType, topOrOrSz: number | SizeType, rtOrBot?: number, bottom?: number): Rectangle {
        return Rectangle.adjust(this, leftOrOffs, topOrOrSz, rtOrBot, bottom);
    }

    /** Adds given offsets to a copy of the `rect` Rectangle and returns the copied & adjusted Rectangle. */
    static adjusted(rect: Rectangle, origin: number | PointType, size: number | SizeType): Rectangle;
    /** Clones the `rect` Rectangle, adds `origin` to both origin coordinates and `right` and `bottom` to size coordinates, and returns the new instance. */
    static adjusted(rect: Rectangle, origin: number | PointType, right: number, bottom: number): Rectangle;
    /** Adds given offsets to a copy of `rect` Rectangle and returns the copy. */
    static adjusted(rect: Rectangle, left: number, top: number, right: number, bottom: number): Rectangle;
    // implementation
    static adjusted(rect: Rectangle, leftOrOffs: number | PointType, topOrSz: number | SizeType, rtOrBot?: number, bottom?: number): Rectangle {
        return Rectangle.adjust(rect.clone(), leftOrOffs, topOrSz, rtOrBot, bottom);
    }

    /** Adds `origin` to both `rect.origin` coordinates and `size` to both `rect.size` coordinates. The input rectangle is modified. Returns the adjusted Rectangle.  */
    static adjust(rect: Rectangle, origin: number | PointType, size: number | SizeType): Rectangle;
    /** Adds `origin` to both `rect.origin` coordinates and `right` and `bottom` to `rect.size` coordinates. The input rectangle is modified. Returns the adjusted Rectangle. */
    static adjust(rect: Rectangle, origin: number | PointType, right: number, bottom: number): Rectangle;
    /** Adds given offsets to the given rectangle's coordinates. The input rectangle is modified. Returns the adjusted Rectangle. */
    static adjust(rect: Rectangle, left: number, top: number, right: number, bottom: number): Rectangle;
    /** This overload is for internal use; one of the other overloads will be invoked in most cases. */
    static adjust(rect: Rectangle, leftOrOffs: number | PointType, topOrSz: number | SizeType, rtOrBot?: number, bottom?: number): Rectangle;
    // implementation
    static adjust(
        rect: Rectangle,
        leftOrOffs: number | PointType,
        topOrSz: number | SizeType,
        rtOrBot?: number,
        bottom?: number
    ): Rectangle
    {
        if (bottom === undefined)
            rect.origin.plus_eq(leftOrOffs);
        else
            rect.origin.plus_eq(leftOrOffs, topOrSz as number);
        const szIsObj = typeof topOrSz != "number";
        rect.width += rtOrBot ?? (szIsObj ? topOrSz.width : topOrSz);
        rect.height += bottom ?? rtOrBot ?? (szIsObj ? topOrSz.height : topOrSz);
        return rect;
    }

    static [Symbol.hasInstance](obj: any) {
        return typeof obj == "object" && 'origin' in obj && 'size' in obj;
    }

}
