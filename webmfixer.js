/// @ts-check

/*
This thing tries to make WebM videos recorded by the MediaRecorder API in Chrome seekable.
It doesn't fully conform to the WebM / Matroska specification because it doesn't care about
using elements from the correct version and updating metadata about the last writer
*/

/** @type {HTMLInputElement} *//// @ts-ignore
var f = document.getElementById("f");
/** @type {HTMLAnchorElement} *//// @ts-ignore
var a = document.getElementById("a");
/** @type {HTMLButtonElement} *//// @ts-ignore
var b = document.getElementById("b");
/** @type {HTMLButtonElement} *//// @ts-ignore
var k = document.getElementById("k");
/** @type {HTMLSpanElement} *//// @ts-ignore
var kn = document.getElementById("kn");
/** @type {HTMLOutputElement} *//// @ts-ignore
var o = document.getElementById("o");

b.onclick = main;
k.onclick = getOutFile;

const NO_OUT_SEL = "{Downloads}";

const Mkv = {
    EBMLHeader: 0x1A45DFA3,
    CRC: 0xBF,
    Void: 0xEC,
    Segment: 0x18538067,
        SeekHead: 0x114D9B74,
            Seek: 0x4DBB,
                SeekID: 0x53AB,
                SeekPosition: 0x53AC,
        Info: 0x1549A966,
            TimestampScale: 0x2AD7B1,
            Duration: 0x4489,
        Tracks: 0x1654AE6B,
            TrackEntry: 0xAE,
                TrackNumber: 0xD7,
                TrackType: 0x83,
                TrackTimestampScale: 0x23314F,
        Cluster: 0x1F43B675,
            Timestamp: 0xE7,
            SimpleBlock: 0xA3,
            BlockGroup: 0xA0,
                Block: 0xA1,
                CodecState: 0xA4,
                ReferenceBlock: 0xF3,
        Cues: 0x1C53BB6B,
            CuePoint: 0xBB,
                CueTime: 0xB3,
                CueTrackPositions: 0xB7,
                    CueTrack: 0xF7,
                    CueClusterPosition: 0xF1,
                    CueRelativePosition: 0xF0,
                    CueCodecState: 0xEA,
        Chapters: 0x1043A770,
        Tags: 0x1254C367,
        Attachments: 0x1941A469
};
const rootLevel = [Mkv.EBMLHeader, Mkv.Segment];
const segmentLevel = [Mkv.SeekHead, Mkv.Info, Mkv.Cluster, Mkv.Tracks, Mkv.Tags, Mkv.Cues, Mkv.Chapters, Mkv.Attachments];
/** @type {MkvRootElemInfo[]} */
var roots;
/** @type {null | {createWritable(): Promise<WritableStream&{truncate(size:number):Promise<void>}>, name: string}} */
var outFile = null;
kn.innerText = NO_OUT_SEL;
async function getOutFile() {
    try {
        let options = {
            id: "webmfixeroutput",
            types: [{accept: {"video/webm": [".webm"]}}]
        };
        if(f.files && f.files.length > 0) options.suggestedName = "x-"+f.files[0].name;
        // @ts-ignore
        outFile = await showSaveFilePicker(options);
    } catch (err) {
        console.error(err);
        outFile = null;
    }
    if(outFile) kn.innerText = outFile.name;
    else kn.innerText = NO_OUT_SEL;
}
async function main() {
    b.disabled = true;
    f.disabled = true;
    k.disabled = true;
    var progress1 = document.createElement("progress");
    var progress2 = document.createElement("progress");
    var label1 = document.createElement("label");
    var label2 = document.createElement("label");
    var div1 = document.createElement("div");
    var div2 = document.createElement("div");
    div1.innerText = "Scanning file...";
    div2.innerText = "Copying contents...";
    a.innerText="";
    progress1.value=progress2.value=0;
    roots = [];
    try {
        o.appendChild(label1);
        o.appendChild(label2);
        label1.appendChild(progress1);
        label2.appendChild(progress2);
        label1.appendChild(div1);
        label2.appendChild(div2);
        if(a.href) URL.revokeObjectURL(a.href);
        a.removeAttribute("href");
        const file = f.files ? f.files[0] : null;
        if (!file) {
            alert("Please select an input file");
            return;
        }
        
        const stream = file.stream();
        /** fill @var roots with info about Mkv file contents */
        await useGeneratorOnReadableStream(readWebmFile, stream, progress1, roots, file);

        const transform = makeTransformStreamFromGenerator(insertSeekInfo, progress2, roots, file);

        const resultStream = file.stream().pipeThrough(transform);

        /** @type {Promise} */
        let promise;
        let saveToFile = false;
        try {
            // @ts-ignore
            let outStream = await outFile.createWritable();
            promise = resultStream.pipeTo(outStream);
            saveToFile = true;
        }
        catch(err) {
            if(outFile) {
                console.error(err);
            }
            const resp = new Response(resultStream, {"headers":{"Content-Type":file.type}});
            promise = resp.blob();
        }
        const blob = await promise;
        if(saveToFile) {
            a.removeAttribute("href");
            a.innerText = "Done";
        }
        else {
            a.href = URL.createObjectURL(blob);
            a.innerText = "Download result";
            a.download = "x-"+file.name;
        }
    } catch(err) {
        alert(err);
        throw err;
    } finally {
        console.log(roots);
        b.disabled = false;
        f.disabled = false;
        k.disabled = false;
        label1.remove();
        label2.remove();
    }
}
/** @typedef {{offset: number, next: ()=>Generator<0, number, Uint8Array>, skip: (count:number)=>Generator<0, void, Uint8Array>}} GeneratorizedStreamReader */
/**
 * @param {(stream: GeneratorizedStreamReader, ...rest: any[])=>Iterator<0|1|2,any,Uint8Array>} reader
 * @param {ReadableStream<Uint8Array>} stream
 * @param {any[]} args
 */
async function useGeneratorOnReadableStream(reader, stream, ...args) {
    var sreader = stream.getReader();
    /** @type {Uint8Array} *////@ts-ignore
    var arr = [];
    var offset = 0;
    /** @returns {Generator<0,number,Uint8Array>} */
    function* getNextByte() {
        if (offset >= arr.length) {
            arr = yield 0;
            offset = 0;
        }
        obj.offset++;
        return arr[offset++];
    }
    /** 
     * @param {number} count
     * @returns {Generator<0,void,Uint8Array>} 
     **/
    function* skipBytes(count) {
        count = +count;
        obj.offset += count;
        while (offset + count > arr.length) {
            count -= arr.length - offset;
            arr = yield 0;
            offset = 0;
        }
        offset += count;
    }
    /** @type {GeneratorizedStreamReader} */
    var obj = { offset: 0, next: getNextByte, skip: skipBytes };
    var x = reader(obj, ...args);
    var r = x.next();
    while (!r.done) {
        var u8a = r.value === 0 ? await sreader.read() : await new Promise(resolve => setTimeout(() => resolve({ done: false, value: arr }), 0));
        if (u8a.done) {
            if (x.throw) x.throw(new Error("Unexpected end of stream"));
            else throw new Error("Unexpected end of stream, can't throw on generator");
        }
        else r = x.next(u8a.value);
    }
    await sreader.cancel();
    return r.value;
}

var BUFFER_SIZE = 1024 * 1024; // 1 MB
/** @typedef {GeneratorizedStreamReader & {outputOffset: number, write: (byte:number)=>Generator<2,void,Uint8Array>, copyNextBytes: (count: number)=>Generator<0|1,void,Uint8Array>}} GeneratorizedStreamTransformer */
/**
 * @param {(stream: GeneratorizedStreamTransformer, ...rest: any[])=>Iterator<0|1|2,any,Uint8Array>} reader
 * @param {any[]} args
 */
function makeTransformStreamFromGenerator(reader, ...args) {
    var ts = new TransformStream();
    var stream = ts.readable;
    var sreader = stream.getReader();
    var readable = new ReadableStream({
        start(controller) {
            (async () => {
                /** @type {Uint8Array} *////@ts-ignore
                var inputArray = [];
                var offset = 0;
                /** @returns {Generator<0,number,Uint8Array>} */
                function* getNextByte() {
                    if (offset >= inputArray.length) {
                        inputArray = yield 0;
                        offset = 0;
                    }
                    obj.offset++;
                    return inputArray[offset++];
                }
                /** 
                 * @param {number} count
                 * @returns {Generator<0,void,Uint8Array>} 
                 **/
                function* skipBytes(count) {
                    count = +count;
                    obj.offset += count;
                    while (offset + count > inputArray.length) {
                        count -= inputArray.length - offset;
                        inputArray = yield 0;
                        offset = 0;
                    }
                    offset += count;
                }
                var outputArray = new Uint8Array(BUFFER_SIZE);
                var outputOffset = 0;
                /** @returns {Generator<2,void,Uint8Array>} */
                function* writeByte(byte) {
                    if (outputOffset >= outputArray.length) {
                        while(controller.desiredSize !== null && controller.desiredSize <= 0) yield 2;
                        controller.enqueue(outputArray);
                        outputArray = new Uint8Array(BUFFER_SIZE);
                        outputOffset = 0;
                    }
                    obj.outputOffset++;
                    outputArray[outputOffset++]=byte;
                }
                /** @returns {Generator<0|1,void,Uint8Array>} */
                function* copyNext(count) {
                    obj.offset+=count;
                    obj.outputOffset+=count;
                    while(count>0) {
                        if(outputOffset >= outputArray.length) {
                            while(controller.desiredSize !== null && controller.desiredSize <= 0) yield 1;
                            controller.enqueue(outputArray);
                            outputArray = new Uint8Array(BUFFER_SIZE);
                            outputOffset = 0;
                        }
                        if (offset >= inputArray.length) {
                            inputArray = yield 0;
                            offset = 0;
                        }
                        let len = Math.min(outputArray.length - outputOffset, inputArray.length - offset, count);
                        outputArray.set(inputArray.subarray(offset, offset+len), outputOffset);
                        outputOffset += len;
                        offset += len;
                        count -= len;
                    }
                }
                /** @type {GeneratorizedStreamTransformer} */
                var obj = { offset: 0, outputOffset: 0, next: getNextByte, skip: skipBytes, write: writeByte, copyNextBytes: copyNext };
                var x = reader(obj, ...args);
                var r = x.next();
                while (!r.done) {
                    var u8a = r.value === 0 ? await sreader.read() : await new Promise(resolve => setTimeout(() => resolve({ done: false, value: inputArray }), 0));
                    if (u8a.done) {
                        if (x.throw) x.throw(new Error("Unexpected end of stream"));
                        else throw new Error("Unexpected end of stream, can't throw on generator");
                    }
                    else r = x.next(u8a.value);
                }
                if(outputOffset > 0) controller.enqueue(outputArray.subarray(0,outputOffset));
                await sreader.cancel();
            })().then(()=>controller.close(), (error)=>controller.error(error));
        }
    });
    return { readable, writable: ts.writable };
}

/** @typedef {{topLevels: MkvTopLevelInfo[], tracks: MkvTrackInfo[], start: number, id: number, dataOffset: number, timestampScale: number, length: number, durationRawLength: number}} MkvRootElemInfo */
/** @typedef {{offset: number, id: number, idSize: number, length: number, rawLength: number}} MkvTopLevelInfo */
/** @typedef {{number: number, numLength: number, type: number, keyFrames: MkvKeyFrameInfo[], timestampScale: number, lastTimestamp: number}} MkvTrackInfo */
/** @typedef {{clusterOffset: number, clusterTimestamp: number, relOffset: number, relTimestamp: number, codecState?: number|null}} MkvKeyFrameInfo */

/**
 * @param {GeneratorizedStreamReader} stream
 * @param {HTMLProgressElement} progress
 * @param {MkvRootElemInfo[]} roots
 * @param {Blob} file
 */
function* readWebmFile(stream, progress, roots, file) {
    const ebml = new EBMLHelper();
    const float = new Float();
    progress.max = file.size;
    progress.value = 0;
    var offsetSum = 0;
    var topLevels = [];
    var clusterOffset = 0;
    var clusterDataStart = 0;
    var clusterTimestamp = 0;
    /** @type {MkvTrackInfo[]} */
    var tracks = [];
    /** @type {Object<number,number>} */
    var trackNums = [];
    var rootEnd = Infinity;
    var i = 0;
    while (stream.offset < file.size) {
        var start = stream.offset;
        var id = yield* ebml.readElementID(stream);
        var idSize = ebml.lastVIntLength;
        var len = yield* ebml.readElementLength(stream);
        if (rootLevel.includes(id)) {
            // if (roots.length > 0) {
            //     let prev = roots[roots.length - 1];
            //     prev.end = start;
            //     if (rootEnd === Infinity) {
            //         let newLenLen = 1 + Math.max(0, Math.floor(Math.log2(prev.end - prev.dataOffset + 1) / 7));
            //         prev.start += offsetSum;
            //         offsetSum += newLenLen - rootLenLen;
            //         for (let tl of topLevels) {
            //             tl.offset += offsetSum;
            //         }
            //         for (let track of tracks) {
            //             for (let frame of track.keyFrames) {
            //                 frame.clusterOffset += offsetSum;
            //             }
            //         }
            //         prev.end += offsetSum;
            //         prev.dataOffset += offsetSum;
            //     }
            // }
            topLevels = [];
            tracks = [];
            trackNums = [];
            roots.push({ topLevels, tracks, start: start, id, dataOffset: stream.offset, timestampScale: 1000000, length: len, durationRawLength: 0 });
            if (len < 0) rootEnd = Infinity;
            else rootEnd = stream.offset + len;
            var rootLenLen = ebml.lastVIntLength;
        }
        else if (roots.length === 0) {
            throw new Error("This is not a WebM/Matroska file");
        }
        else if (segmentLevel.includes(id)) {
            if (id === Mkv.Cluster) {
                clusterOffset = start;
                clusterDataStart = stream.offset;
            }
            topLevels.push({ offset: start, id, idSize, length:len, rawLength: len+stream.offset-start });
        }
        switch (id) {
            case Mkv.Segment:
            case Mkv.Cluster: {
                // ezeket korábban kezeltük
            } break;
            // Segment/Cluster/Timestamp
            case Mkv.Timestamp: {
                if (len <= 8 && stream.offset + len < rootEnd) {
                    clusterTimestamp = 0;
                    for (let i = 0; i < len; i++) {
                        clusterTimestamp *= 256;
                        clusterTimestamp += yield* stream.next();
                    }
                }
                else yield* stream.skip(Math.min(len, rootEnd - stream.offset));
            } break;
            // Segment/Cluster/SimpleBlock
            case Mkv.SimpleBlock: {
                let end = Math.min(rootEnd, stream.offset + len);
                let trackNumber = yield* ebml.readVInt(stream);
                let relTimestamp = (yield* stream.next()) * 256 + (yield* stream.next());
                if ((yield* stream.next()) & 0x80 /** is keyframe? */) {
                    if (!(trackNumber in trackNums)) {
                        trackNums[trackNumber] = tracks.length;
                        tracks.push({ number: trackNumber, numLength: 0, type: -1, keyFrames: [], timestampScale: 1, lastTimestamp: clusterTimestamp });
                    }
                    tracks[trackNums[trackNumber]].keyFrames.push({ clusterOffset, clusterTimestamp, relTimestamp, relOffset: start - clusterDataStart });
                }
                if (trackNumber in trackNums) tracks[trackNums[trackNumber]].lastTimestamp = Math.max(tracks[trackNums[trackNumber]].lastTimestamp, clusterTimestamp + tracks[trackNums[trackNumber]].timestampScale*relTimestamp);
                yield* stream.skip(end - stream.offset);
            } break;
            // Segment/Cluster/BlockGroup
            case Mkv.BlockGroup: {
                let end = Math.min(rootEnd, stream.offset + len);
                let isKeyFrame = true;
                let relTimestamp = 0;
                let codecState = null;
                let trackNumber;
                while (stream.offset < end) {
                    let start2 = stream.offset;
                    let id2 = yield* ebml.readElementID(stream);
                    let len2 = yield* ebml.readElementLength(stream);
                    let end2 = Math.min(stream.offset + len2, end);
                    if (id2 === Mkv.ReferenceBlock) {
                        isKeyFrame = false;
                    }
                    if (id2 === Mkv.Block) {
                        trackNumber = yield* ebml.readVInt(stream);
                        relTimestamp = (yield* stream.next()) * 256 + (yield* stream.next());
                    }
                    if (id2 === Mkv.CodecState) {
                        codecState = start2;
                    }
                    yield* stream.skip(end2 - stream.offset);
                }
                if (isKeyFrame || codecState !== null) {
                    if (typeof trackNumber !== "number") throw new Error("keyframe in undefined track");
                    if (!(trackNumber in trackNums)) {
                        trackNums[trackNumber] = tracks.length;
                        tracks.push({ number: trackNumber, numLength: 0, type: -1, keyFrames: [], timestampScale:1, lastTimestamp: 0 });
                    }
                    tracks[trackNums[trackNumber]].keyFrames.push({ clusterOffset, clusterTimestamp, relTimestamp, relOffset: start - clusterDataStart, codecState });
                }
                if (typeof trackNumber === "number" && (trackNumber in trackNums)) tracks[trackNums[trackNumber]].lastTimestamp = Math.max(tracks[trackNums[trackNumber]].lastTimestamp, clusterTimestamp + tracks[trackNums[trackNumber]].timestampScale*relTimestamp);
                yield* stream.skip(end - stream.offset);
            } break;
            // Segment/Tracks
            case Mkv.Tracks: {
                let end = Math.min(rootEnd, stream.offset + len);
                let trackNumber = 0;
                let trackNumLength = 0;
                let trackType = 0;
                let trackTimestampScale = 1;
                while (stream.offset < end) {
                    let id2 = yield* ebml.readElementID(stream);
                    let len2 = yield* ebml.readElementLength(stream);
                    let end2 = Math.min(stream.offset + len2, end);
                    if (id2 === Mkv.TrackEntry) {
                        while (stream.offset < end2) {
                            let id3 = yield* ebml.readElementID(stream);
                            let len3 = yield* ebml.readElementLength(stream);
                            let end3 = Math.min(end2, stream.offset + len3);
                            if (id3 === Mkv.TrackNumber || id3 === Mkv.TrackType) {
                                let val = 0;
                                while (stream.offset < end3) {
                                    val *= 256;
                                    val += yield* stream.next();
                                }
                                if (id3 === Mkv.TrackNumber) {trackNumber = val; trackNumLength = len3;}
                                else trackType = val;
                            }
                            else if(id3 === Mkv.TrackTimestampScale && (len3 === 4 || len3 === 8)) {
                                if(len3 === 4) trackTimestampScale = yield* float.readFloat32(stream);
                                else trackTimestampScale = yield* float.readFloat64(stream);
                            }
                            else yield* stream.skip(end3 - stream.offset);
                        }
                        if (!(trackNumber in trackNums)) {
                            trackNums[trackNumber] = tracks.length;
                            tracks.push({ number: trackNumber, numLength: trackNumLength, type: trackType, keyFrames: [], timestampScale:trackTimestampScale, lastTimestamp: 0 });
                        }
                        yield* stream.skip(end - stream.offset);
                    }
                    yield* stream.skip(end2 - stream.offset);
                }
            } break;
            case Mkv.Info : {
                let end = Math.min(rootEnd, stream.offset + len);
                while (stream.offset < end) {
                    let pos = stream.offset;
                    let id2 = yield* ebml.readElementID(stream);
                    let len2 = yield* ebml.readElementLength(stream);
                    let end2 = Math.min(stream.offset + len2, end);
                    if (id2 === Mkv.TimestampScale && stream.offset + len2 <= end) {
                        let scale = 0;
                        for(let i=0; i<len2; i++) {
                            scale *= 256;
                            scale += yield* stream.next();
                        }
                        if(scale > 0) roots[roots.length-1].timestampScale = scale;
                    }
                    if (id2 === Mkv.Duration) {
                        roots[roots.length-1].durationRawLength = stream.offset - pos + len2;
                        // @ts-ignore
                        topLevels[topLevels.length-1].durationElemPos = pos;
                    }
                    yield* stream.skip(end2 - stream.offset);
                }
            } break;
            default: {
                if (len >= 0) yield* stream.skip(Math.min(len, rootEnd - stream.offset));
            }
        }
        progress.value = stream.offset;
        progress.dataset.time = Math.floor(clusterTimestamp * (roots[roots.length-1].timestampScale/1000000) / 3600000) + ":" + Math.floor(clusterTimestamp / 60000) % 60 + ":" + (clusterTimestamp / 1000 % 60).toFixed(2)
        if (++i % 1000 === 0) yield 1;
    }
}

/**
 * @param {GeneratorizedStreamTransformer} stream
 * @param {HTMLProgressElement} progress
 * @param {Blob} file
 * @param {MkvRootElemInfo[]} roots
 * @returns {Generator<0|1|2,void,Uint8Array>}
 */
function* insertSeekInfo(stream, progress, roots, file) {
    const ebml = new EBMLHelper();
    const float = new Float();
    progress.max = file.size;
    progress.value = 0;
    for (let i = 0; i < roots.length; i++) {
        let rootEnd = i + 1 < roots.length ? roots[i + 1].start : file.size;
        let segmentStart = roots[i].dataOffset;
        let topLevels = roots[i].topLevels;
        if (roots[i].id !== Mkv.Segment) {
            yield* stream.copyNextBytes(rootEnd - roots[i].start);
            progress.value = stream.offset;
            continue;
        }
        let frameEstimated = 1_000_000_000 / 30 / roots[i].timestampScale;
        let newDuration = 0;
        let newDurationRawLength = 2+1+8;
        for(let track of roots[i].tracks) {
            newDuration = Math.max(newDuration, track.lastTimestamp + frameEstimated);
        }
        if(newDuration <= 0) newDurationRawLength = roots[i].durationRawLength;
        yield* stream.skip(segmentStart - stream.offset);
        yield* ebml.writeElementID(stream, Mkv.Segment);
        yield* stream.write(0xFF); // Size = Unknown
        /** @type {{segPos:number,id:number,idSize:number}[]} */
        let seekInfo = [];
        let seekLength = 0;
        let skipStart = [0];
        let skipLength = [segmentStart];
        var skip = segmentStart;
        for (let j = 0; j < topLevels.length; j++) {
            let elem = topLevels[j];
            let end = j + 1 < topLevels.length ? topLevels[j + 1].offset : rootEnd;
            if (elem.id === Mkv.SeekHead || elem.id === Mkv.Cues) {
                skip += Math.min(end - elem.offset, elem.rawLength);
                skipStart.push(elem.offset);
                skipLength.push(skip);
            }
            else if (elem.id !== Mkv.Cluster) {
                seekInfo.push({ segPos: elem.offset - skip, id: elem.id, idSize: elem.idSize });
                //          [Seek][len]  [SeekID][len][data] [SeekPosition][len][data]
                seekLength +=  2   +1       +2    +1  +elem.idSize +2       +1   +8;
                
                if (elem.id === Mkv.Info && newDuration > 0) {
                    skip -= newDurationRawLength - roots[i].durationRawLength + 4-(elem.rawLength-elem.length-elem.idSize);
                    skipStart.push(elem.offset + 2);
                    skipLength.push(skip);
                }
            }
        }
        skipStart.push(rootEnd);
        skipLength.push(skip);
        seekInfo.push({ segPos: rootEnd - skip, id: Mkv.Cues, idSize: 4 });
        seekLength += 2 +1 +2 +1 +4 +2 +1 +8
        yield* ebml.writeElementID(stream, Mkv.SeekHead);
        if(seekLength >= ((1<<28)-1)) throw new Error("Overflow in SeekHead");
        yield* stream.write((seekLength>>>24) | 0x10);
        yield* stream.write(seekLength>>>16);
        yield* stream.write(seekLength>>>8);
        yield* stream.write(seekLength>>>0);
        for(let seek of seekInfo) {
            yield* ebml.writeElementID(stream, Mkv.Seek);
            yield* stream.write((2+1+seek.idSize+2+1+8) | 0x80);
            yield* ebml.writeElementID(stream, Mkv.SeekID);
            yield* stream.write(seek.idSize | 0x80);
            for(let i=seek.idSize-1; i>=0; i--) yield* stream.write(Math.floor(seek.id/256**i));
            yield* ebml.writeElementID(stream, Mkv.SeekPosition);
            yield* stream.write(8 | 0x80);
            seek.segPos+=seekLength + 8;
            for(let j=7; j>=0; j--) {
                yield* stream.write(Math.floor(seek.segPos/256**j));
            }
        }
        for(let j=0; j<topLevels.length; j++) {
            let elem = topLevels[j];
            let end = j + 1 < topLevels.length ? topLevels[j + 1].offset : rootEnd;
            yield* stream.copyNextBytes(elem.offset - stream.offset);
            if (elem.id === Mkv.SeekHead || elem.id === Mkv.Cues) {
                yield* stream.skip(Math.min(elem.rawLength, end-elem.offset));
            }
            else if(elem.id === Mkv.Info && newDuration > 0) {
                yield* stream.copyNextBytes(elem.idSize);
                yield* ebml.readElementLength(stream);
                let len = elem.length + newDurationRawLength - roots[i].durationRawLength;
                yield* stream.write((len>>>24) | 0x10);
                yield* stream.write(len>>>16);
                yield* stream.write(len>>>8);
                yield* stream.write(len>>>0);
                if("durationElemPos" in elem && typeof elem.durationElemPos === "number") {
                    yield* stream.copyNextBytes(elem.durationElemPos - stream.offset);
                }
                else {
                    yield* stream.copyNextBytes(end - stream.offset);
                }
                yield* ebml.writeElementID(stream, Mkv.Duration);
                yield* stream.write(8 | 0x80);
                yield* float.writeFloat64(stream, newDuration);
                if("durationElemPos" in elem && typeof elem.durationElemPos === "number") {
                    yield* stream.skip(roots[i].durationRawLength);
                }
            }
            yield* stream.copyNextBytes(end - stream.offset);
            progress.value = stream.offset;
        }
        yield* stream.copyNextBytes(rootEnd - stream.offset);
        let cues = [];
        let cuesLength = 0;
        for(let track of roots[i].tracks) {
            let lastTime = -Infinity;
            let codecState = 0;
            for(let frame of track.keyFrames) {
                let clusterTime = frame.clusterTimestamp*roots[i].timestampScale;
                let relativeTime = frame.relTimestamp*roots[i].timestampScale*track.timestampScale;
                let time = (clusterTime+relativeTime)/roots[i].timestampScale;
                if(/*track.type !== 2 ||*/ time > lastTime + 500) {
                    if(frame.codecState) codecState = frame.codecState;
                    let offset = frame.clusterOffset;
                    let skipMin = 0, skipMax = skipStart.length;
                    while(skipMax-skipMin > 1) {
                        let center = Math.floor((skipMin+skipMax)/2);
                        if(skipStart[center]>offset) skipMax=center;
                        else skipMin = center;
                    }
                    offset -= skipLength[skipMin];
                    offset += seekLength + 8;
                    let length = 1+1+8 + 1+1  +  1+1+track.numLength + 1+1+8 + 1+1+8 + 1+1+8;
                    cues.push({track, time, frame, offset, codecState, length});
                    // [CuePoint][len]
                    //   [CueTime][len][data]
                    //   [CueTrackPositions][len]
                    //     [CueTrack][len][data]
                    //     [CueClusterPosition][len][data]
                    //     [CueRelativePosition][len][data]
                    //     [CueCodecState][len][data]
                    cuesLength += 1+1  + length;
                    lastTime = time;
                }
            }
        }
        cues.sort((a, b)=>a.time-b.time);
        yield* ebml.writeElementID(stream, Mkv.Cues);
        yield* stream.write((cuesLength>>>24) | 0x10);
        yield* stream.write(cuesLength>>>16);
        yield* stream.write(cuesLength>>>8);
        yield* stream.write(cuesLength>>>0);
        for(let cuePoint of cues) {
            yield* ebml.writeElementID(stream, Mkv.CuePoint);
            yield* stream.write(cuePoint.length | 0x80);
            yield* ebml.writeElementID(stream, Mkv.CueTime);
            yield* stream.write(8 | 0x80);
            for(let j=7; j>=0; j--) {
                yield* stream.write(Math.floor(cuePoint.time/256**j));
            }
            yield* ebml.writeElementID(stream, Mkv.CueTrackPositions);
            yield* stream.write((cuePoint.length - (1+1+8 + 1+1)) | 0x80);
            yield* ebml.writeElementID(stream, Mkv.CueTrack);
            yield* stream.write(cuePoint.track.numLength | 0x80);
            for(let j=cuePoint.track.numLength-1; j>=0; j--) {
                yield* stream.write(Math.floor(cuePoint.track.number/256**j));
            }
            yield* ebml.writeElementID(stream, Mkv.CueClusterPosition);
            yield* stream.write(8 | 0x80);
            for(let j=7; j>=0; j--) {
                yield* stream.write(Math.floor(cuePoint.offset/256**j));
            }
            yield* ebml.writeElementID(stream, Mkv.CueRelativePosition);
            yield* stream.write(8 | 0x80);
            for(let j=7; j>=0; j--) {
                yield* stream.write(Math.floor(cuePoint.frame.relOffset/256**j));
            }
            yield* ebml.writeElementID(stream, Mkv.CueCodecState);
            yield* stream.write(8 | 0x80);
            for(let j=7; j>=0; j--) {
                yield* stream.write(Math.floor(cuePoint.codecState/256**j));
            }
        }
    }
}

class EBMLHelper {
    /**
     * @param {GeneratorizedStreamReader} stream
     * @returns {Generator<0|1, number, Uint8Array>}
     **/
    *readElementID(stream) {
        var len = 1;
        var val = yield* stream.next();
        var lengthIndicator = val | 1;
        for (var i = 0x80; !(lengthIndicator & i); i >>= 1, len++) {
            val *= 256;
            val += yield* stream.next();
        }
        this.lastVIntLength = len;
        return val;
    }
    /**
     * @param {GeneratorizedStreamTransformer} stream
     * @param {number} ID
     * @returns {Generator<2, void, Uint8Array>}
     **/
    *writeElementID(stream, ID) {
        var len = 1;
        while(ID > (256**len)-1 && len<8) len++;
        while(len>0) {
            yield* stream.write(ID >>> 8*(--len));
        }
    }
    /**
     * @param {GeneratorizedStreamReader} stream
     * @returns {Generator<0|1, number, Uint8Array>}
     **/
    *readElementLength(stream) {
        var len = 1;
        var byte = yield* stream.next();
        var first = byte;
        var lengthIndicator = byte | 1;
        var all1 = !(byte & (byte + 1));
        var val = 0;
        for (var i = 0x80; !(lengthIndicator & i); i >>= 1, len++) {
            byte = yield* stream.next();
            val *= 256;
            val += byte;
            all1 = all1 && byte === 255;
        }
        first -= i;
        val += first * (256 ** (len - 1));
        this.lastVIntLength = len;
        if (!all1) return val;
        else return -1;
    }
    /**
     * @param {GeneratorizedStreamReader} stream
     * @returns {Generator<0|1, number, Uint8Array>}
     **/
    *readVInt(stream) {
        var len = 1;
        var byte = yield* stream.next();
        var first = byte;
        var lengthIndicator = byte | 1;
        var val = 0;
        for (var i = 0x80; !(lengthIndicator & i); i >>= 1, len++) {
            val *= 256;
            val += yield* stream.next();
        }
        first -= i;
        val += first * (256 ** (len - 1));
        this.lastVIntLength = len;
        return val;
    }
    lastVIntLength = 0;
}
class Float {
    floatDV = new DataView(new ArrayBuffer(8));
    /**
     * @param {GeneratorizedStreamReader} stream
     * @returns {Generator<0|1,number,Uint8Array>}
     **/
    *readFloat32(stream) {
        for(let i=0; i<4; i++) this.floatDV.setUint8(i, yield* stream.next());
        return this.floatDV.getFloat32(0);
    }
    /**
     * @param {GeneratorizedStreamReader} stream
     * @returns {Generator<0|1,number,Uint8Array>}
     **/
    *readFloat64(stream) {
        for(let i=0; i<8; i++) this.floatDV.setUint8(i, yield* stream.next());
        return this.floatDV.getFloat64(0);
    }
    /**
     * @param {GeneratorizedStreamTransformer} stream
     * @param {number} float
     * @returns {Generator<0|2,void,Uint8Array>}
     */
    *writeFloat32(stream, float) {
        this.floatDV.setFloat32(0, float);
        for(let i=0; i<4; i++) yield* stream.write(this.floatDV.getUint8(i));
    }
    /**
     * @param {GeneratorizedStreamTransformer} stream
     * @param {number} float
     * @returns {Generator<0|2,void,Uint8Array>}
     */
    *writeFloat64(stream, float) {
        this.floatDV.setFloat64(0, float);
        for(let i=0; i<8; i++) yield* stream.write(this.floatDV.getUint8(i));
    }
}