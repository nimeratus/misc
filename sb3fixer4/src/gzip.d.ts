type ByteWritable = ArrayBufferView | ArrayBufferLike;
type ByteReadable = ByteWritable | ArrayLike<number> | Iterable<number>;
/**
 * @typedef {ArrayBufferView | ArrayBufferLike} ByteWritable
 * @typedef {ByteWritable | ArrayLike<number> | Iterable<number>} ByteReadable
 */
/** https://datatracker.ietf.org/doc/html/rfc1951 */
declare const Deflate: Readonly<{
    lenCodes: readonly number[];
    lens: readonly {
        len: number;
        bits: number;
    }[];
    dists: readonly {
        dist: number;
        bits: number;
    }[];
    /**
     * @param {ByteReadable} x
     * @returns {Uint8Array}
     */
    asUint8Array(x: ByteReadable): Uint8Array;
    /**
     * @param {ByteReadable} readFrom
     * @param {ByteWritable} writeTo
     */
    decode(readFrom: ByteReadable, writeTo: ByteWritable): number;
    /**
 * @param {ByteReadable} source
 * @returns {{compressed: number, uncompressed: number}}
 */
    getSize(source: ByteReadable): {
        compressed: number;
        uncompressed: number;
    };
    /**
     * @param {ByteReadable} source
     * @returns {ArrayBuffer} the source in Deflate format, without compression
     */
    encode(source: ByteReadable): ArrayBuffer;
    /**
     * @deprecated
     * @param {ByteReadable} source
     * @returns {ArrayBuffer} if it worked, it would return the source in Deflate format, compressed
     */
    compress(source: ByteReadable): ArrayBuffer;
}>;
/** https://datatracker.ietf.org/doc/html/rfc1952 */
declare const Gzip: Readonly<{
    /**
     * @param {ByteReadable} source
     * @returns {ArrayBuffer[]}
     */
    decode(source: ByteReadable): ArrayBuffer[];
    /** @param {ByteReadable} data */
    encode(data: ByteReadable): ArrayBuffer;
    /** This is a copy of the code at https://datatracker.ietf.org/doc/html/rfc1952#section-8 but it's translated to JavaScript */
    crc: {
        /**
         * Table of CRCs of all 8-bit messages.
         * @type {number[]?}
         **/
        table: number[] | null;
        /** Make the table for a fast CRC. */
        make_table(): number[];
        /**
         * Update a running crc with the bytes buf[0..len-1] and return
         * the updated crc. The crc should be initialized to zero. Pre- and
         * post-conditioning (one's complement) is performed within this
         * function so it shouldn't be done by the caller.
         * @param {number} crc
         * @param {ArrayLike<number>} data
         * @returns {number}
         **/
        update_crc(crc: number, data: ArrayLike<number>): number;
        /** @param {ArrayLike<number>} data */
        crc(data: ArrayLike<number>): number;
    };
}>;
/** https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT */
declare class Zip {
    #private;
    static utils: Readonly<{
        /** @type {<T>(x:T)=>T} */
        structuredClone: <T>(x: T) => T;
    }>;
    get zipFile(): Blob;
    get metadataLoaded(): boolean;
    get fileContentLoaded(): boolean;
    /** Meant to be used by `ZipMaker.copyFiles()`
     * @deprecated <- this hides it from the autocomplete */
    _getAllMetadata(): {
        [path: string]: {
            offset: number;
            compSize: number;
            realSize: number;
            cdirOffset: number;
        };
    } | undefined;
    root: string;
    /**
     * @param {Blob} file
     */
    constructor(file: Blob);
    /**
     * @param {{max?: number, value?: number}} progress
     */
    loadAllFiles(progress?: {
        max?: number;
        value?: number;
    }): Promise<void>;
    /**
     * @param {{max?: number, value?: number}} progress
     */
    loadMetadata(progress?: {
        max?: number;
        value?: number;
    }): Promise<void>;
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns if there is a file with this path
     */
    hasFile(path: string): boolean;
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns the size of the file as if it was extracted
     */
    getFileSize(path: string): number;
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns the size of the file as it's compressed in the zip now
     */
    getCompressedFileSize(path: string): number;
    /**
     * Requires all files to be loaded
     * @param {string} path
     * @returns {ArrayBuffer} an ArrayBuffer with file content
     */
    getFileContent(path: string): ArrayBuffer;
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns {Promise<ArrayBuffer>}
     */
    getFileContentAsync(path: string): Promise<ArrayBuffer>;
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns {DataView}
     */
    getRawCentralHeader(path: string): DataView;
    /**
     * Requires all files to be loaded
     * @param {string} path
     * @returns {ArrayBuffer} local header + raw (maybe compressed) file content
     */
    getRawFileData(path: string): ArrayBuffer;
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns {Promise<Blob>} local header + raw (maybe compressed) file content
     */
    getRawFileDataBlobAsync(path: string): Promise<Blob>;
    /**
     * Requires metadata to be loaded
     * @param {string} path to the directory to list, must end with "/" if not empty
     */
    listDirectoryContent(path: string): string[];
}
/**
 * Allows copying and skipping a specific amount of bytes in a ReadableStream
 */
declare class StreamSlicer {
    /** @type {ReadableStream<Uint8Array>} */
    stream: ReadableStream<Uint8Array>;
    /** @type {ReadableStreamDefaultReader<Uint8Array>} */
    reader: ReadableStreamDefaultReader<Uint8Array>;
    /** @type {Uint8Array} */
    chunk: Uint8Array;
    /** @type {number} how many bytes were copied/skipped in the current chunk */
    offset: number;
    /**
     * @param {ReadableStream<Uint8Array>} stream
     */
    constructor(stream: ReadableStream<Uint8Array>);
    /**
     * @param {number} n number of bytes to copy
     * @param {WritableStreamDefaultWriter} writer writer to write the copied bytes to
     */
    copyNextNBytes(n: number, writer: WritableStreamDefaultWriter): Promise<void>;
    /**
     * @param {number} n
     * @returns {Promise<Uint8Array>}
     */
    getNextNBytes(n: number): Promise<Uint8Array>;
    /**
     * @param {number} n number of bytes to skip
     */
    skipNextNBytes(n: number): Promise<void>;
    releaseStream(): void;
    cancelStream(): Promise<void>;
}
/**
 * Makes an uncompressed zip file
 */
declare class ZipMaker {
    tr: TransformStream<any, any>;
    result: Promise<Blob>;
    /** @type {({offset:number,size:number,crc:number,name:string}|{offset:number,cdir:DataView})[]} */
    files: ({
        offset: number;
        size: number;
        crc: number;
        name: string;
    } | {
        offset: number;
        cdir: DataView;
    })[];
    offset: number;
    addFile(/** @type {Blob} */ file: Blob, /** @type {string} */ name: string): Promise<void>;
    copyFile(/** @type {Zip} */ zip: Zip, /** @type {string} */ path: string): Promise<void>;
    /**
     * @param zip The Zip whose files will be copied. The metadata of the Zip must be loaded
     */
    copyFiles(/** @type {Zip} */ zip: Zip, /** @type {Iterable<string>} */ _paths: Iterable<string>, /** @type {{max?:number, value?:number}} */ progressElem?: {
        max?: number;
        value?: number;
    }): Promise<void>;
    generateZip(): Promise<Blob>;
}
