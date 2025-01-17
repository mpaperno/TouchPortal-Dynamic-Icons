
import sharp from 'sharp';
import { loadImage } from 'skia-canvas';
import { Mutex } from 'async-mutex';
import { SizeType } from './geometry';
import { logIt } from '../common'
import { isAbsolute as isAbsPath, join as pjoin } from 'path';

/** Central storage for various image processing options; Set via ImageCache.cacheOptions
Some of these could in theory be controlled via plugin settings or action data. */
class ImageCacheOptions {
    /** Maximum number of cache records, zero to disable cache;
    actual cache size may grow a bit above this level to optimize the buffer trimming operations.
    Reducing this value at runtime will only take effect next time an image is added to the cache. */
    maxCachedImages: number = 250;
    baseImagePath: string = "";
    // See https://sharp.pixelplumbing.com/api-constructor#sharp
    sourceLoadOptions: any = { density: 72 };  // [dpi] only relevant for loading vector graphics. 72 is default;
    // See also https://sharp.pixelplumbing.com/api-resize#resize
    resizeOptions: any = {
        fit: 'contain',              // how the image should be resized to fit both provided dimensions, one of: cover, contain, fill, inside or outside. (optional, default 'cover')
        kernel: 'mitchell',          // the kernel to use for image reduction. one of: nearest, cubic, mitchell, lanczos2, lanczos3 (optional, default 'lanczos3')
        withoutEnlargement: false,   // do not enlarge if the width or height are already less than the specified dimensions. (optional, default false)
        withoutReduction: false,     // do not reduce if the width or height are already greater than the specified dimensions. (optional, default false)
        background: { r: 0, g: 0, b: 0, alpha: 0 }  // background colour when fit is contain, parsed by the color module. (optional, default {r:0,g:0,b:0,alpha:1})
        // position String: position, gravity or strategy to use when fit is cover or contain. (optional, default 'centre')
        // fastShrinkOnLoad: take greater advantage of the JPEG and WebP shrink-on-load feature, which can lead to a slight moiré pattern on some images. (optional, default true)
    };
    // See also https://sharp.pixelplumbing.com/api-output#png
    cachedPngOptions: any = {
        compressionLevel: 0,   // zlib compression level, 0 (fastest, largest) to 9 (slowest, smallest) (optional, default 6)
        effort: 1,             // CPU effort, between 1 (fastest) and 10 (slowest), sets palette to true (optional, default 7)
        palette: true,         // quantise to a palette-based image with alpha transparency support (optional, default false)
        // progressive: use progressive (interlace) scan (optional, default false)
        // adaptiveFiltering: use adaptive row filtering (optional, default false)
        // quality: use the lowest number of colours needed to achieve given quality, sets palette to true (optional, default 100)
        // colours: maximum number of palette entries, sets palette to true (optional, default 256)
        // dither:level of Floyd-Steinberg error diffusion, sets palette to true (optional, default 1.0)
    };  // low compression, high speed, quantise with transparency
}

export type ImageDataType = HTMLImageElement | null;

type ImageRecord = {
    image: ImageDataType
    iconNames: string[]   // icon(s) using this cached image
}
class ImageStorage extends Map<string, ImageRecord> {}  // just an alias

/**
Provides a cache for image data originally read from files or other sources, which may possibly be scaled or otherwise transformed before storage.
The cache key is based on a combination of the requested source file plus the desired size and resize options (as passed to the various methods).
Currently the images are stored as HTMLImageElement instance references, since that is what we use to draw and composite the images onto the resulting skia-canvas.
This class is designed to be used as a singleton static instance. The instance can be obtained with the globalImageCache export or ImageCache.Instance.
 */
export class ImageCache
{

    public static cacheOptions: ImageCacheOptions = new ImageCacheOptions();

    // private:

    private static instance: ImageCache;
    private static cacheHighTide = 25;  // cache can exceed maximum size by this many records before trimming
    private trimTimerId: ReturnType<typeof setTimeout> | null = null;
    private cache: ImageStorage = new ImageStorage();
    private mutex: Mutex = new Mutex();

    private constructor() {}  // singleton pattern, use ImageCache.Instance or globalImageCache

    private makeKey(src: string, size: SizeType, resizeOptions:any = {}): string {
        // this could be more flexible by serializing resizeOptions object but that would be slower... this method will be hit often.
        return src + ',' + size.width + ',' + size.height + ',' + (resizeOptions.fit || ImageCache.cacheOptions.resizeOptions.fit);
    }

    private async trimCache()
    {
        await this.mutex.runExclusive(async() =>
        {
            let deltaSz = this.count() - ImageCache.cacheOptions.maxCachedImages;
            if (deltaSz <= 0)
                return;
            const it = this.cache.keys();
            let key = it.next();
            while (!key.done && deltaSz > 0) {
                this.cache.delete(key.value);
                --deltaSz;
                key = it.next();
            }
        });
        logIt("DEBUG", "Trimmed cache to", this.count(), "records");
    }

    // The private methods provide actual implementation but w/out mutex locking.
    private getImage_impl(key: string): ImageDataType {
        const record: ImageRecord | undefined = this.cache.get(key);
        return record ? record.image : null;
    }

    // The private methods provide actual implementation but w/out mutex locking.
    private saveImage_impl(key: string, image: ImageDataType, meta?: any) {
        if (!image)
            return;
        try {
            let rec: ImageRecord | undefined = this.cache.get(key);
            if (rec) {
                rec.image = image;
            }
            else {
                rec = { image: image, iconNames: [] }
                this.cache.set(key, rec);
            }
            if (typeof(meta.iconName) !== "undefined" && meta.iconName && !rec.iconNames.includes(meta.iconName))
                rec.iconNames.push(meta.iconName);

            // Check for cache overflow; schedule trim if needed.
            if (!this.trimTimerId && this.count() >= ImageCache.cacheOptions.maxCachedImages + ImageCache.cacheHighTide)
                this.trimTimerId = setTimeout(() => { this.trimCache(); this.trimTimerId = null; }, 1000);
        }
        catch (e) {
            logIt("ERROR", e);
        }
    }

    // public:

    /** Get the static global instance of the cache object. See also `globalImageCache` export. */
    public static get Instance() {
        return this.instance || (this.instance = new ImageCache());
    }

    /** Returns an image from cache if it exists, otherwise loads the image, potentially scales it
    to fit the given size, and saves it to cache. Cache key is based on image source and requested size and options.
    If cache is disabled (cacheOptions.maxCachedImages == 0) then cache check is bypassed and this is effectively the same as calling LoadImage() directly.
    See LoadImage() for argument details.
     */
    public async getOrLoadImage(src: string, size: SizeType, resizeOptions:any = {}, meta?: any): Promise<ImageDataType>
    {
        if (ImageCache.cacheOptions.baseImagePath && !isAbsPath(src))
            src = pjoin(ImageCache.cacheOptions.baseImagePath, src);
        if (ImageCache.cacheOptions.maxCachedImages <= 0)
            return this.loadImage(src, size, resizeOptions);  // short-circuit for disabled cache

        let img:ImageDataType = null;
        const key:string = this.makeKey(src, size, resizeOptions);
        await this.mutex.runExclusive(async() => {
            img = this.getImage_impl(key);
            if (!img) {
                img = await this.loadImage(src, size, resizeOptions);
                if (img)
                    this.saveImage_impl(key, img, meta);
                logIt("DEBUG", "Image cache miss for", src, "Returned:", img);
            }
        });
        return img;
    }

    /** Returns an image from cache if it exists, otherwise returns null.
    Cache key is based on image source and requested size and options.  */
    public async getImage(src: string, size: SizeType, resizeOptions:any = {}): Promise<ImageDataType> {
        let image: ImageDataType = null;
        try {
            await this.mutex.runExclusive(async() => {
                image = this.getImage_impl(this.makeKey(src, size, resizeOptions));
            });
        }
        catch (e) { logIt("ERROR", e); }
        return image;
    }

    /** Saves an image to cache, possibly replacing any existing entry with the same key.
    Cache key is based on image source and requested size and options. */
    public async saveImage(src: string, size: SizeType, image: ImageDataType, resizeOptions:any = {}, meta?: any) {
        try {
            await this.mutex.runExclusive(async() => {
                this.saveImage_impl(this.makeKey(src, size, resizeOptions), image, meta);
            });
        }
        catch (e) { logIt("ERROR", e); }
    }

    /** Loads an image from source file and potentially scales it to fit the given size with optional resize options.
    Set size to {0,0} or resizeOptions.fit to "none" to avoid scaling. Resize options object properties are merged with and override ImageCache.cacheOptions.resizeOptions defaults.
    Returns null if image loading fails.
    */
    public async loadImage(src: string, size: SizeType, resizeOptions:any = {}): Promise<ImageDataType> {
        let imgBuffer: Buffer | null = null;
        try {
            const image = sharp(src, ImageCache.cacheOptions.sourceLoadOptions);
            if (image) {
                resizeOptions = { ...ImageCache.cacheOptions.resizeOptions, ...resizeOptions };
                if ((size.width || size.height) && resizeOptions.fit !== "none") {
                    if (resizeOptions.fit === "scale-down") {
                        resizeOptions.fit = "contain";
                        resizeOptions.withoutEnlargement = true;
                    }
                    image.resize(size.width || null, size.height || null, resizeOptions);
                }
                imgBuffer = await image.png(ImageCache.cacheOptions.cachedPngOptions).toBuffer();
            }
        }
        catch (e) {
            logIt("ERROR", e);
        }
        return imgBuffer ? loadImage(imgBuffer) : null;
    }

    /** Returns number of records currently in cache. */
    public count(): number {
        return this.cache.size;
    }

    /** Removes all entries from the cache. */
    public async clear() {
        await this.mutex.runExclusive(async() => {
            this.cache.clear();
            logIt("INFO", "Image cache cleared.")
        });
    }

    /** Removes all entries for a specific icon name from the cache. This will also affect any other icons using the same cached image. */
    public async clearIconName(name: string) {
        await this.mutex.runExclusive(async() => {
            for (const [k, v] of this.cache.entries()) {
                if (v.iconNames.includes(name)) {
                    this.cache.delete(k);
                    logIt("INFO", `Removed cached image ${k.split(',')[0]} for icon '${name}'.`);
                }
            }
        });
    }

}

const globalImageCache = ImageCache.Instance;
export default globalImageCache;
