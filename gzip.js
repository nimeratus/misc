// @ts-check

// A zip and gzip file library that I've made and I use it for my projects
// I have many copies of it on my computer
// It doesn't fully support everything
//  - it can only decompress Deflate compression
//  - it can't compress things if I remember
//  - it can't set date/time and file attributes so it puts 0 there instead
// but it can copy files quickly in the zip files with the copyFiles() function
// which doesn't decompress the files, it just copies them as they were in the old zip file

/** https://datatracker.ietf.org/doc/html/rfc1951 */
const Deflate = Object.freeze({
    lenCodes: Object.freeze([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),
    /** @type {{len: number, bits: number}[]} */
    lens: [],
    /** @type {{dist: number, bits: number}[]} */
    dists: [],
    /**
     * @param {ArrayBufferView|ArrayBufferLike|ArrayLike<number>} readFrom
     * @param {ArrayBufferView|ArrayBufferLike} writeTo
     */
    decode(readFrom, writeTo) {
        var /** @type {Uint8Array} */ src, /** @type {Uint8Array} */ dst;
        if(ArrayBuffer.isView(readFrom))
            src=new Uint8Array(readFrom.buffer, readFrom.byteOffset, readFrom.byteLength);
        else
            src=new Uint8Array(readFrom);
        if(ArrayBuffer.isView(writeTo))
            dst=new Uint8Array(writeTo.buffer, writeTo.byteOffset, writeTo.byteLength);
        else
            dst=new Uint8Array(writeTo);
        var last=false;
        /** @param {number} i */
        function getbit(i) {
            return (src[Math.floor(i/8)]>>(i&7))&1;
        }
        var n=0; var k;
        var lithl=Array(288), lithp=Array(288), lit,  litmax;
        var bitlhl=Array(19), bitlhp=Array(19), bit,  bitmax;
        var disthl=Array(32), disthp=Array(32), dist, distmax;
        for(var i=0; i<src.length*8&&!last; ) {
            var H=0;
            if(getbit(i++)) last=true;
            H|=getbit(i++);
            H|=getbit(i++)<<1;
            switch(H) {
                case 0:
                    i=Math.ceil(i/8);
                    var len=src[i]|(src[i+1]<<8); i+=2;
                    var nlen=src[i]|(src[i+1]<<8); i+=2;
                    if(len!=((~nlen)&65535)) throw new Error("Error in compressed data");
                    for(let k=0; k<len; k++) {
                        if(n>=dst.length) return -1;
                        dst[n++]=src[i++];
                    }
                    i*=8;
                    continue;
                case 1:
                    for(k=0; k<=143; k++) lithl[k]=8;
                    for(k=144; k<=255; k++) lithl[k]=9;
                    for(k=256; k<=279; k++) lithl[k]=7;
                    for(k=280; k<=287; k++) lithl[k]=8;
                    for(k=0; k<32; k++) disthl[k]=5;
                    break;
                case 2:
                    var litn=0;
                    for(k=0; k<5; k++) litn|=getbit(i++)<<k;
                    litn+=257;
                    var distn=0;
                    for(k=0; k<5; k++) distn|=getbit(i++)<<k;
                    distn+=1;
                    var bitln=0;
                    for(k=0; k<4; k++) bitln|=getbit(i++)<<k;
                    bitln+=4;
                    for(k=0; k<bitln; k++) {
                        var bitlk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2); i+=3;
                        bitlhl[this.lenCodes[k]]=bitlk;
                        bitlhp[k]=k;
                    }
                    for(k=bitln; k<19; k++) bitlhl[this.lenCodes[bitlhp[k]=k]]=0;
                    bitlhp.sort((a,b)=>bitlhl[a]==bitlhl[b]?a-b:bitlhl[a]-bitlhl[b]);
                    bitlk=0;
                    bit=[]; bitmax=0;
                    for(k=0; bitlhl[bitlhp[k]]===0; k++);
                    for(; k<19; k++) {
                        if(bitlk>=1<<bitlhl[bitlhp[k]]) throw new Error("Error in compressed data");
                        if(bitlk>bitmax) bitmax=bitlk;
                        bit[bitlk++]=bitlhp[k]
                        if(k<18) bitlk<<=bitlhl[bitlhp[k+1]]-bitlhl[bitlhp[k]];
                    }
                    var litk = 0, litkl=0;
                    for(k=0; k<litn; ) {
                        litk=(litk<<1)|getbit(i++); litkl++;
                        if(litk>bitmax) throw new Error("Error in compressed data");
                        if((litk in bit) && bitlhl[bit[litk]]==litkl) {
                            litk=bit[litk];
                            if(litk<16) lithl[k++]=litk;
                            else {
                                switch(litk) {
                                    case 16:
                                        litk=(getbit(i))|(getbit(i+1)<<1); i+=2;
                                        litk+=3;
                                        if(k==0) throw new Error("Error in compressed data");
                                        for(;litk>0;litk--) lithl[k]=lithl[k-1], k++;
                                        break;
                                    case 17:
                                        litk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2); i+=3;
                                        litk+=3;
                                        for(;litk>0;litk--) lithl[k++]=0;
                                        break;
                                    case 18:
                                        litk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2)|(getbit(i+3)<<3)|(getbit(i+4)<<4)|(getbit(i+5)<<5)|(getbit(i+6)<<6); i+=7;
                                        litk+=11;
                                        for(;litk>0;litk--) lithl[k++]=0;
                                        break;
                                }
                            }
                            litk=litkl=0;
                        }
                    }
                    bitln=k-litn;
                    if(k>litn) {
                        for(let i=0; i+litn<k; i++) {
                            disthl[i]=lithl[i+litn];
                        }
                        k=litn;
                        lithl.length=288;
                    }
                    for(; k<288; k++) lithl[k]=0;
                    var distk = 0, distkl=0;
                    for(k=bitln; k<distn; ) {
                        distk=(distk<<1)|getbit(i++);distkl++;
                        if(distk>bitmax) throw new Error("Error in compressed data");
                        if((distk in bit) && bitlhl[bit[distk]]==distkl) {
                            distk=bit[distk];
                            if(distk<16) disthl[k++]=distk;
                            else {
                                switch(distk) {
                                    case 16:
                                        distk=(getbit(i))|(getbit(i+1)<<1); i+=2;
                                        distk+=3;
                                        if(k==0) throw new Error("Error in compressed data");
                                        for(;distk>0;distk--) disthl[k]=disthl[k-1], k++;
                                        break;
                                    case 17:
                                        distk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2); i+=3;
                                        distk+=3;
                                        for(;distk>0;distk--) disthl[k++]=0;
                                        break;
                                    case 18:
                                        distk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2)|(getbit(i+3)<<3)|(getbit(i+4)<<4)|(getbit(i+5)<<5)|(getbit(i+6)<<6); i+=7;
                                        distk+=11;
                                        for(;distk>0;distk--) disthl[k++]=0;
                                        break;
                                }
                            }
                            distk=distkl=0;
                        }
                    }
                    if(k>distn) throw new Error("Error in compressed data");
                    for(; k<32; k++) disthl[k]=0;
                    break;
                default:
                    throw new Error("Error in compressed data");
            }
            for(k=0; k<288; k++) {
                lithp[k]=k;
            }
            lithp.sort((a,b)=>lithl[a]==lithl[b]?a-b:lithl[a]-lithl[b]);
            var litk=0;
            lit=[]; litmax=0;
            for(k=0; lithl[lithp[k]]===0; k++);
            for(; k<288; k++) {
                if(litk>1<<lithl[lithp[k]]) throw new Error("Error in compressed data");
                if(litk>litmax) litmax=litk;
                lit[litk++]=lithp[k];
                if(k<287) litk<<=lithl[lithp[k+1]]-lithl[lithp[k]];
            }
            for(k=0; k<32; k++) {
                disthp[k]=k;
            }
            disthp.sort((a,b)=>disthl[a]==disthl[b]?a-b:disthl[a]-disthl[b]);
            var distk=0;
            dist=[]; distmax=0;
            for(k=0; disthl[disthp[k]]===0; k++);
            for(; k<32; k++) {
                if(distk>1<<disthl[disthp[k]]) throw new Error("Error in compressed data");
                if(distk>distmax) distmax=distk;
                dist[distk++]=disthp[k];
                if(k<31) distk<<=disthl[disthp[k+1]]-disthl[disthp[k]];
            }
            var end=false;
            litk=0;
            var litkl=0;
            while(!end) {
                litk=(litk<<1)|getbit(i++);litkl++;
                if(litk>litmax) throw new Error("Error in compressed data");
                if((litk in lit) && lithl[lit[litk]]==litkl) {
                    litk=lit[litk];
                    if(litk<256) {
                        if(n>=dst.length) return -1;
                        dst[n++]=litk;
                    }
                    else if(litk==256) {
                        end=true;
                    }
                    else if(litk>=286) {
                        throw new Error("Error in compressed data");
                    }
                    else {
                        let {len, bits}=this.lens[litk];
                        let p=0;
                        for(let j=0; j<bits; j++) p|=getbit(i++)<<j;
                        len+=p;
                        let distk=0;
                        let distkl=0;
                        do {
                            distk=(distk<<1)|getbit(i++);distkl++;
                            if(distk>distmax) throw new Error("Error in compressed data");
                        } while(!((distk in dist) && disthl[dist[distk]]==distkl));
                        distk=dist[distk];
                        if(distk>=30) throw new Error("Error in compressed data");
                        ({dist: distk, bits}=this.dists[distk]);
                        p=0;
                        for(let j=0; j<bits; j++) p|=getbit(i++)<<j;
                        distk+=p;
                        if(distk>n) throw new Error("Error in compressed data");
                        for(;len>0;len--) {
                            if(n>=dst.length) return -1;
                            dst[n]=dst[n-distk];n++;
                        }
                    }
                    litk=litkl=0;
                }
            }
        }
        return n;
    },
        /**
     * @param {ArrayBufferView|ArrayBufferLike|ArrayLike<number>} source
     * @returns {{compressed: number, uncompressed: number}}
     */
    getSize(source) {
        var /** @type {Uint8Array} */ src;
        if(ArrayBuffer.isView(source))
            src=new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
        else
            src=new Uint8Array(source);
        var last=false;
        /** @param {number} i */
        function getbit(i) {
            return (src[Math.floor(i/8)]>>(i&7))&1;
        }
        var n=0; var k;
        var lithl=Array(288), lithp=Array(288), lit,  litmax;
        var bitlhl=Array(19), bitlhp=Array(19), bit,  bitmax;
        var disthl=Array(32), disthp=Array(32), dist, distmax;
        for(var i=0; i<src.length*8&&!last; ) {
            var H=0;
            if(getbit(i++)) last=true;
            H|=getbit(i++);
            H|=getbit(i++)<<1;
            switch(H) {
                case 0:
                    i=Math.ceil(i/8);
                    var len=src[i]|(src[i+1]<<8); i+=2;
                    var nlen=src[i]|(src[i+1]<<8); i+=2;
                    if(len!=((~nlen)&65535)) throw new Error("Error in compressed data");
                    n+=len; i+=len;
                    i*=8;
                    continue;
                case 1:
                    for(k=0; k<=143; k++) lithl[k]=8;
                    for(k=144; k<=255; k++) lithl[k]=9;
                    for(k=256; k<=279; k++) lithl[k]=7;
                    for(k=280; k<=287; k++) lithl[k]=8;
                    for(k=0; k<32; k++) disthl[k]=5;
                    break;
                case 2:
                    var litn=0;
                    for(k=0; k<5; k++) litn|=getbit(i++)<<k;
                    litn+=257;
                    var distn=0;
                    for(k=0; k<5; k++) distn|=getbit(i++)<<k;
                    distn+=1;
                    var bitln=0;
                    for(k=0; k<4; k++) bitln|=getbit(i++)<<k;
                    bitln+=4;
                    for(k=0; k<bitln; k++) {
                        var bitlk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2); i+=3;
                        bitlhl[this.lenCodes[k]]=bitlk;
                        bitlhp[k]=k;
                    }
                    for(k=bitln; k<19; k++) bitlhl[this.lenCodes[bitlhp[k]=k]]=0;
                    bitlhp.sort((a,b)=>bitlhl[a]==bitlhl[b]?a-b:bitlhl[a]-bitlhl[b]);
                    bitlk=0;
                    bit=[]; bitmax=0;
                    for(k=0; bitlhl[bitlhp[k]]===0; k++);
                    for(; k<19; k++) {
                        if(bitlk>=1<<bitlhl[bitlhp[k]]) throw new Error("Error in compressed data");
                        if(bitlk>bitmax) bitmax=bitlk;
                        bit[bitlk++]=bitlhp[k]
                        if(k<18) bitlk<<=bitlhl[bitlhp[k+1]]-bitlhl[bitlhp[k]];
                    }
                    var litk = 0, litkl=0;
                    for(k=0; k<litn; ) {
                        litk=(litk<<1)|getbit(i++); litkl++;
                        if(litk>bitmax) throw new Error("Error in compressed data");
                        if((litk in bit) && bitlhl[bit[litk]]==litkl) {
                            litk=bit[litk];
                            if(litk<16) lithl[k++]=litk;
                            else {
                                switch(litk) {
                                    case 16:
                                        litk=(getbit(i))|(getbit(i+1)<<1); i+=2;
                                        litk+=3;
                                        if(k==0) throw new Error("Error in compressed data");
                                        for(;litk>0;litk--) lithl[k]=lithl[k-1], k++;
                                        break;
                                    case 17:
                                        litk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2); i+=3;
                                        litk+=3;
                                        for(;litk>0;litk--) lithl[k++]=0;
                                        break;
                                    case 18:
                                        litk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2)|(getbit(i+3)<<3)|(getbit(i+4)<<4)|(getbit(i+5)<<5)|(getbit(i+6)<<6); i+=7;
                                        litk+=11;
                                        for(;litk>0;litk--) lithl[k++]=0;
                                        break;
                                }
                            }
                            litk=litkl=0;
                        }
                    }
                    if(k>litn) throw new Error("Error in compressed data");
                    for(; k<288; k++) lithl[k]=0;
                    var distk = 0, distkl=0;
                    for(k=0; k<distn; ) {
                        distk=(distk<<1)|getbit(i++);distkl++;
                        if(distk>bitmax) throw new Error("Error in compressed data");
                        if((distk in bit) && bitlhl[bit[distk]]==distkl) {
                            distk=bit[distk];
                            if(distk<16) disthl[k++]=distk;
                            else {
                                switch(distk) {
                                    case 16:
                                        distk=(getbit(i))|(getbit(i+1)<<1); i+=2;
                                        distk+=3;
                                        if(k==0) throw new Error("Error in compressed data");
                                        for(;distk>0;distk--) disthl[k]=disthl[k-1], k++;
                                        break;
                                    case 17:
                                        distk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2); i+=3;
                                        distk+=3;
                                        for(;distk>0;distk--) disthl[k++]=0;
                                        break;
                                    case 18:
                                        distk=(getbit(i))|(getbit(i+1)<<1)|(getbit(i+2)<<2)|(getbit(i+3)<<3)|(getbit(i+4)<<4)|(getbit(i+5)<<5)|(getbit(i+6)<<6); i+=7;
                                        distk+=11;
                                        for(;distk>0;distk--) disthl[k++]=0;
                                        break;
                                }
                            }
                            distk=distkl=0;
                        }
                    }
                    if(k>distn) throw new Error("Error in compressed data");
                    for(; k<32; k++) disthl[k]=0;
                    break;
                default:
                    throw new Error("Error in compressed data");
            }
            for(k=0; k<288; k++) {
                lithp[k]=k;
            }
            lithp.sort((a,b)=>lithl[a]==lithl[b]?a-b:lithl[a]-lithl[b]);
            var litk=0;
            lit=[]; litmax=0;
            for(k=0; lithl[lithp[k]]===0; k++);
            for(; k<288; k++) {
                if(litk>1<<lithl[lithp[k]]) throw new Error("Error in compressed data");
                if(litk>litmax) litmax=litk;
                lit[litk++]=lithp[k];
                if(k<287) litk<<=lithl[lithp[k+1]]-lithl[lithp[k]];
            }
            for(k=0; k<32; k++) {
                disthp[k]=k;
            }
            disthp.sort((a,b)=>disthl[a]==disthl[b]?a-b:disthl[a]-disthl[b]);
            var distk=0;
            dist=[]; distmax=0;
            for(k=0; disthl[disthp[k]]===0; k++);
            for(; k<32; k++) {
                if(distk>1<<disthl[disthp[k]]) throw new Error("Error in compressed data");
                if(distk>distmax) distmax=distk;
                dist[distk++]=disthp[k];
                if(k<31) distk<<=disthl[disthp[k+1]]-disthl[disthp[k]];
            }
            var end=false;
            litk=0;
            var litkl=0;
            while(!end) {
                litk=(litk<<1)|getbit(i++);litkl++;
                if(litk>litmax) throw new Error("Error in compressed data");
                if((litk in lit) && lithl[lit[litk]]==litkl) {
                    litk=lit[litk];
                    if(litk<256) {
                        n++;
                    }
                    else if(litk==256) {
                        end=true;
                    }
                    else if(litk>=286) {
                        throw new Error("Error in compressed data");
                    }
                    else {
                        let {len, bits}=this.lens[litk];
                        let p=0;
                        for(let j=0; j<bits; j++) p|=getbit(i++)<<j;
                        len+=p;
                        let distk=0;
                        let distkl=0;
                        do {
                            distk=(distk<<1)|getbit(i++);distkl++;
                            if(distk>distmax) throw new Error("Error in compressed data");
                        } while(!((distk in dist) && disthl[dist[distk]]==distkl));
                        distk=dist[distk];
                        if(distk>=30) throw new Error("Error in compressed data");
                        ({dist: distk, bits}=this.dists[distk]);
                        p=0;
                        for(let j=0; j<bits; j++) p|=getbit(i++)<<j;
                        distk+=p;
                        if(distk>n) throw new Error("Error in compressed data");
                        n+=len;
                    }
                    litk=litkl=0;
                }
            }
        }
        return {compressed:Math.ceil(i/8), uncompressed: n};
    },
    /**
     * @param {ArrayBufferView|ArrayBufferLike|ArrayLike<number>} source
     * @returns {ArrayBuffer} the source in Deflate format, without compression
     */
    encode(source) {
        /** @type {Uint8Array} */
        var src;
        if(ArrayBuffer.isView(source))
            src=new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
        else
            src=new Uint8Array(source);
        var len=src.length;
        len+=Math.ceil(len/65535)*5;
        var res=new ArrayBuffer(len);
        var u8a=new Uint8Array(res);
        var n=0;
        for(var i=0; i<src.length; i++, n++) {
            if(i%65535==0) {
                if(src.length-i>65535) {
                    u8a[n++]=0;
                    u8a[n++]=255;
                    u8a[n++]=255;
                    u8a[n++]=0;
                    u8a[n++]=0;
                }
                else {
                    u8a[n++]=1;
                    u8a[n++]=(src.length-i)&0xFF;
                    u8a[n++]=(src.length-i)>>8;
                    u8a[n++]=(~(src.length-i))&0xFF;
                    u8a[n++]=(~((src.length-i)>>8))&0xFF;
                }
            }
            u8a[n]=src[i];
        }
        return res;
    },
    /**
     * @param {ArrayBufferView|ArrayBufferLike|ArrayLike<number>} source
     * @returns {ArrayBuffer} the source in Deflate format, compressed
     */
    compress(source) {
        /**
         * @type {(x:number, y:number, z:number) => number}
         */
        function hash(x,y,z) {
            return (x^(y<<5)^(z<<10)^(z>>6))&0xffff;
        }
        /** @typedef {{next: LinkedItem, value: number}|undefined} LinkedItem */
        /** @type {LinkedItem[]} */
        let hashTable = Array(0x10000);
        /** @type {Uint8Array} */
        let src;
        if(ArrayBuffer.isView(source))
            src=new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
        else
            src=new Uint8Array(source);
        /** @type {(number|[number,number])[]} */
        let compressedData=[];
        let i;
        for(i=0; i+2<src.length; i++) {
            let maxLength = 0;
            let maxItem = 0;
            let item = hashTable[hash(src[i],src[i+1],src[i+2])];
            while(item) {
                if(i-item.value>32768) break;
                let j;
                for(j=0; i+j<src.length&&j<258; j++) {
                    if(src[item.value+j]!==src[i+j]) break;
                }
                if(j>maxLength) {
                    maxLength=j;
                    maxItem=item.value;
                    if(j===258) break;
                }
                item=item.next;
            }
            if(maxLength>=3) {
                compressedData.push([i-maxItem,maxLength]);
                for(let j=1; j<maxLength; j++) {
                    let hashValue=hash(src[i],src[i+1],src[i+2]);
                    hashTable[hashValue]={value:i,next:hashTable[hashValue]};
                    i++;
                }
            }
            else {
                compressedData.push(src[i]);
            }
            let hashValue=hash(src[i],src[i+1],src[i+2]);
            hashTable[hashValue]={value:i,next:hashTable[hashValue]};
        }
        for(; i<src.length; i++) {
            compressedData.push(src[i]);
        }
        /** @type {number[]} */
        let litCounts=Array(286);
        /** @type {number[]} */
        let dstCounts=Array(29);
        for(let i=0; i<286; i++) litCounts[i]=0;
        for(let i=0; i<30; i++) dstCounts[i]=0;
        for(let lit of compressedData) {
            if(typeof lit === "number") litCounts[lit]++;
            else {
                let min=257, max=286, c;
                while(max-min>1) {
                    c=Math.floor((min+max)/2);
                    if(this.lens[c].len>lit[1]) max=c;
                    else min=c;
                }
                litCounts[min]++;
                min=0; max=30;
                while(max-min>1) {
                    c=Math.floor((min+max)/2);
                    if(this.dists[c].dist>lit[0]) max=c;
                    else min=c;
                }
                dstCounts[min]++;
            }
        }
        litCounts[256]=1;
        /** @typedef {{size: number, value: number|[HuffmanTree,HuffmanTree]}} HuffmanTree */
        /**
         * @param {HuffmanTree[]} trees
         */
        function huffmanCode(trees) {
            trees.sort((a,b)=>a.size-b.size);
            while(trees.length>1) {
                let a = trees.shift(), b = trees.shift();
                /** @type {HuffmanTree} */ // @ts-ignore a and b won't be undefined because the loop runs only if trees.length>1
                let n = {size: a.size+b.size, value: [a, b]};
                let min=0, max=trees.length, c;
                while(max-min>1) {
                    c=Math.floor((max+min)/2);
                    if(trees[c].size>n.size) {
                        max=c;
                    }
                    else {
                        min=c;
                    }
                }
                trees.splice(max, 0, n);
            }
        }
        /**
         * @param {any[]} array
         * @returns {number[]}
         */
        function fillZero(array) {
            for(let i=0; i<array.length; i++) {
                array[i]=0;
            }
            return array;
        }
        /** 
         * @param {number[]} codeLengths output
         * @param {HuffmanTree} tree
         */
        function getCodeLengths(codeLengths, tree, currentLength = 0) {
            if(typeof tree.value === "number") {
                codeLengths[tree.value] = currentLength || 1;
            }
            else {
                for(let t of tree.value) {
                    getCodeLengths(codeLengths, t, currentLength + 1);
                }
            }
        }
        /**
         * @param {number[]} codeLengths
         * @param {number} maxLength 
         */
        function fixCodeLengths(codeLengths, maxLength) {
            for(let i=0; i<codeLengths.length; i++) {
                if(codeLengths[i]>maxLength) codeLengths[i]=maxLength;
            }
            let hely=0;
            for(let i=0; i<codeLengths.length; i++) {
                if(!codeLengths[i]) continue;
                hely+=1<<(maxLength+1-codeLengths[i]);
            }
            while(hely>(1<<(maxLength+1))) {
                hely=0;
                for(let i=0; i<codeLengths.length; i++) {
                    if(codeLengths[i]<maxLength) {
                        if(codeLengths[i]>codeLengths[hely]||codeLengths[hely]===maxLength) hely=i;
                    }
                }
                codeLengths[hely]++;
                hely=0;
                for(let i=0; i<codeLengths.length; i++) {
                    if(!codeLengths[i]) continue;
                    hely+=1<<(maxLength+1-codeLengths[i]);
                }
            }
        }
        /**
         * @param {number[]} codeWords output
         * @param {number[]} codeLengths
         */
        function getCodeWords(codeWords, codeLengths) {
            let index=codeLengths.map((x,i)=>i).sort((a,b)=>codeLengths[a]-codeLengths[b]);
            let len=0;
            let word=0;
            for(let i of index) {
                if(!codeLengths[i]) continue;
                word<<=codeLengths[i]-len;
                len=codeLengths[i];
                codeWords[i]=word;
                word++;
            }
        }
        /** @type {HuffmanTree[]} */
        let litHuffman=[];
        for(let i=0; i<286; i++) {
            if(litCounts[i]>0) litHuffman.push({size: litCounts[i], value: i});
        }
        huffmanCode(litHuffman);
        let litCodeLengths = fillZero(Array(286));
        getCodeLengths(litCodeLengths, litHuffman[0]);
        fixCodeLengths(litCodeLengths, 15);
        let litCodeWords = fillZero(Array(286));
        getCodeWords(litCodeWords, litCodeLengths);
        /** @type {HuffmanTree[]} */
        let dstHuffman=[];
        for(let i=0; i<30; i++) {
            if(dstCounts[i]>0) dstHuffman.push({size: dstCounts[i], value: i});
        }
        huffmanCode(dstHuffman);
        let dstCodeLengths = fillZero(Array(30));
        getCodeLengths(dstCodeLengths, dstHuffman[0]);
        fixCodeLengths(dstCodeLengths, 15);
        let dstCodeWords = fillZero(Array(30));
        getCodeWords(dstCodeWords, dstCodeLengths);
        let compressedCodeLengths=[];
        let lastLitCodeLength=285;
        while(litCodeLengths[lastLitCodeLength]===0) lastLitCodeLength--;
        if(lastLitCodeLength<256) lastLitCodeLength=256;
        let lastDstCodeLength=29;
        while(dstCodeLengths[lastDstCodeLength]===0) lastDstCodeLength--;
        if(lastDstCodeLength<0) lastDstCodeLength=0;
        let lastLength=NaN;
        let codeLengths=litCodeLengths.slice(0,lastLitCodeLength+1).concat(dstCodeLengths.slice(0,lastDstCodeLength+1));
        for(let i=0; i<codeLengths.length; i++) {
            if(codeLengths[i]==0) {
                let h=1;
                while(i+h<codeLengths.length&&codeLengths[i+h]==0&&h<138) h++;
                if(h>2) {
                    compressedCodeLengths.push(h>10?[18,h-11]:[17,h-3]);
                    i+=h-1;
                }
                else {
                    compressedCodeLengths.push([0]);
                }
            }
            else {
                let h=1;
                if(lastLength==codeLengths[i]) {
                    while(i+h<codeLengths.length&&codeLengths[i+h]==lastLength&&h<6) h++;
                }
                if(h>2) {
                    compressedCodeLengths.push([16,h-3]);
                    i+=h-1;
                }
                else {
                    compressedCodeLengths.push([codeLengths[i]]);
                }
            }
        }
        /** @type {HuffmanTree[]} */
        let lenHuffman=[];
        /** @type {number[]} */
        let lenCount=[0,0,0,0,0, 0,0,0,0,0,  0,0,0,0,0, 0,0,0,0]; // 0 x 19
        for(let x of compressedCodeLengths) {
            lenCount[x[0]]++;
        }
        for(let i=0; i<lenCount.length; i++) {
            if(lenCount[i]>0) lenHuffman.push({size: lenCount[i], value: i});
        }
        huffmanCode(lenHuffman);
        let lenCodeLengths=fillZero(Array(19));
        getCodeLengths(lenCodeLengths, lenHuffman[0]);
        fixCodeLengths(lenCodeLengths, 7);
        let lenCodeWords=fillZero(Array(19));
        getCodeWords(lenCodeWords,lenCodeLengths);
        let lenCodeLengthsOrdered=Array(19);
        for(let i=0; i<19; i++) {
            lenCodeLengthsOrdered[i]=lenCodeLengths[this.lenCodes[i]];
        }
        let lastLenCodeLength=18;
        while(lenCodeLengthsOrdered[lastLenCodeLength]===0) lastLenCodeLength--;
        if(lastLenCodeLength<3) lastLenCodeLength=3;
        let finalBitCount=17+(lastLenCodeLength+1)*3;
        for(let x of compressedCodeLengths) {
            finalBitCount+=lenCodeLengths[x[0]];
            if(x[0]>15) {
                finalBitCount+=[2,3,7][x[0]-16];
            }
        }
        for(let x of compressedData) {
            if(typeof x === "number") {
                finalBitCount += litCodeLengths[x];
            }
            else {
                let min=257, max=286, c;
                while(max-min>1) {
                    c=Math.floor((min+max)/2);
                    if(this.lens[c].len>x[1]) max=c;
                    else min=c;
                }
                finalBitCount+=litCodeLengths[min];
                finalBitCount+=this.lens[min].bits;
                min=0; max=30;
                while(max-min>1) {
                    c=Math.floor((min+max)/2);
                    if(this.dists[c].dist>x[0]) max=c;
                    else min=c;
                }
                finalBitCount+=dstCodeLengths[min];
                finalBitCount+=this.dists[min].bits;
            }
        }
        finalBitCount += litCodeLengths[256];
        let result=new Uint8Array(Math.ceil(finalBitCount/8));
        /**
         * @param {number} index
         * @param {*} value 
         */
        function setBit(index, value) {
            if(value) result[index>>>3]|=1<<(index&7);
            else result[index>>>3]&=~(1<<(index&7));
        }
        let bit=0;
        setBit(bit++, 1); // last block: true
        setBit(bit++, 0); // block type: 10 (dynamic compressed)
        setBit(bit++, 1);
        for(let HLIT=lastLitCodeLength-256, i=5; i>0; i--, HLIT>>>=1) setBit(bit++, HLIT&1);
        for(let HDIST=lastDstCodeLength, i=5; i>0; i--, HDIST>>>=1) setBit(bit++, HDIST&1);
        for(let HCLEN=lastLenCodeLength-3, i=4; i>0; i--, HCLEN>>>=1) setBit(bit++, HCLEN&1);
        for(let i=0; i<=lastLenCodeLength; i++) {
            for(let len=lenCodeLengthsOrdered[i], j=3; j>0; j--, len>>>=1) setBit(bit++, len&1);
        }
        for(let c of compressedCodeLengths) {
            for(let len=lenCodeWords[c[0]], j=1<<(lenCodeLengths[c[0]]-1); j>0; j>>=1) setBit(bit++, len&j);
            if(c[0]>15) {
                for(let len=c[1], j=[2,3,7][c[0]-16]; j>0; j--, len>>=1) setBit(bit++, len&1);
            }
        }
        for(let d of compressedData) {
            if(typeof d === "number") {
                for(let lit=litCodeWords[d], j=1<<(litCodeLengths[d]-1); j>0; j>>=1) setBit(bit++, lit&j);
            }
            else {
                let min=257, max=286, c;
                while(max-min>1) {
                    c=Math.floor((min+max)/2);
                    if(this.lens[c].len>d[1]) max=c;
                    else min=c;
                }
                for(let lit=litCodeWords[min], j=1<<(litCodeLengths[min]-1); j>0; j>>=1) setBit(bit++, lit&j);
                for(let len=d[1]-this.lens[min].len, j=this.lens[min].bits; j>0; j--, len>>>=1) setBit(bit++, len&1);
                min=0; max=30;
                while(max-min>1) {
                    c=Math.floor((min+max)/2);
                    if(this.dists[c].dist>d[0]) max=c;
                    else min=c;
                }
                for(let dst=dstCodeWords[min], j=1<<(dstCodeLengths[min]-1); j>0; j>>=1) setBit(bit++, dst&j);
                for(let dst=d[0]-this.dists[min].dist, j=this.dists[min].bits; j>0; j--, dst>>>=1) setBit(bit++, dst&1);
            }
        }
        for(let lit=litCodeWords[256], j=1<<(litCodeLengths[256]-1); j>0; j>>=1) setBit(bit++, lit&j);
        return result.buffer;
    }
});
{
    let x=0;
    let y=0;
    for(let i=257; i<285; i++) {
        y=Math.max(0,Math.floor((i-261)/4));
        Deflate.lens[i] = { len: x+3, bits: y };
        x += 1<<y;
    }
    Deflate.lens[285] = { len: 258, bits: 0 };
    Object.freeze(Deflate.lens);
    x=0;
    y=0;
    for(let i=0; i<30; i++) {
        y=Math.max(0,Math.floor((i-2)/2));
        Deflate.dists[i] = { dist: x+1, bits: y };
        x += 1<<y;
    }
    Object.freeze(Deflate.dists);
}
/** https://datatracker.ietf.org/doc/html/rfc1952 */
const Gzip=Object.freeze({
    /**
     * @param {ArrayBufferView|ArrayBufferLike|ArrayLike<number>} source
     * @returns {ArrayBuffer[]}
     */
    decode(source) {
        /** @type {Uint8Array} */
        var src;
        if(ArrayBuffer.isView(source)) src=new Uint8Array(source.buffer,source.byteOffset,source.byteLength);
        else src=new Uint8Array(source);
        /** @type {ArrayBuffer[]} */
        var res=[];
        for(var i=0; i<src.length; ) {
            if(src[i]!=31||src[i+1]!=139) return res;
            i+=2;
            if(src[i++]!=8) return res;
            var flg=src[i++];
            if(flg&~31) return res;
            i+=6;
            if(flg&4) {
                i+=src[i]|(src[i+1]<<8);
                i+=2;
            }
            if(flg&8) {
                while(src[i]) i++;
                i++;
            }
            if(flg&16) {
                while(src[i]) i++;
                i++;
            }
            if(flg&2) i+=2;
            try {
                var s=Deflate.getSize(src.subarray(i));
                if((src[i+s.compressed+4]|src[i+s.compressed+5]<<8|src[i+s.compressed+6]<<16|src[i+s.compressed+7]<<24)!=(s.uncompressed&-1)) throw new Error("Őhm");
            } catch {
                return res;
            }
            var ab=new ArrayBuffer(s.uncompressed);
            try {
                Deflate.decode(src.subarray(i),ab);
            } catch {
                return res;
            }
            res.push(ab);
            i+=8;
        }
        return res;
    },
    /** @param {ArrayBufferLike|ArrayBufferView|ArrayLike<number>} data */
    encode(data) {
        /** @type {Uint8Array} */
        var src;
        if(ArrayBuffer.isView(data)) src=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
        else src=new Uint8Array(data);
        var comp = Deflate.compress(data);
        var res = new ArrayBuffer(comp.byteLength + 18);
        var srca = new Uint8Array(comp);
        var resa = new Uint8Array(res);
        resa[0]=31; resa[1]=139;
        resa[2]=8;
        for(var i=3; i<9; i++) resa[i]=0;
        resa[9]=255;
        resa.set(srca, 10);
        var dv=new DataView(res);
        dv.setInt32(res.byteLength-8, this.crc.crc(src), true);
        dv.setInt32(res.byteLength-4, src.length | 0, true);
        return res;
    },
    /** This is a copy of the code at https://datatracker.ietf.org/doc/html/rfc1952#section-8 but it's translated to JavaScript */
    crc: {
        /**
         * Table of CRCs of all 8-bit messages.
         * @type {number[]?}
         **/
        table: null,
        /** Make the table for a fast CRC. */
        make_table() {
            if(this.table) return;
            this.table = Array(256);
            for(var n = 0; n < 256; n++) {
                var c = n;
                for(var k = 0; k < 8; k++) {
                    if(c & 1) {
                        c = 0xedb88320 ^ (c >>> 1);
                    }
                    else {
                        c = c >>> 1;
                    }
                }
                this.table[n] = c;
            }
        },
        /**
         * Update a running crc with the bytes buf[0..len-1] and return
         * the updated crc. The crc should be initialized to zero. Pre- and
         * post-conditioning (one's complement) is performed within this
         * function so it shouldn't be done by the caller.
         * @param {number} crc
         * @param {ArrayLike<number>} data
         * @returns {number}
         **/
        update_crc(crc, data) {
            var c = ~crc;
            if(!this.table) this.make_table();
            for(var n = 0; n < data.length; n++) { // @ts-ignore this.table is not null because this.make_table() is called
                c = this.table[(c ^ data[n]) & 0xff] ^ c >>> 8;
            }
            return ~c;
        },
        /** @param {ArrayLike<number>} data */
        crc(data) {
            return this.update_crc(0, data);
        }
    }
});

/** https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT */
class Zip {
    /** @type {Blob} */ #zipFile;
    /** @type {{[path: string]: {offset: number, compSize: number, realSize: number, cdirOffset: number}}} */ #files;
    /** @type {ArrayBuffer} */ #ab;
    /** @type {DataView} */ #centralDirectory;
    get zipFile() {return this.#zipFile};
    get metadataLoaded() {return !!this.#files};
    get fileContentLoaded() {return !!this.#ab && !!this.#files};
    /** Meant to be used by `ZipMaker.copyFiles()`
     * @deprecated <- this hides it from the autocomplete */
    _getAllMetadata() {return Zip.utils.structuredClone(this.#files);};
    root="";
    /**
     * @param {Blob} file
     */
    constructor(file) {
        this.#zipFile=file;
    }
    /**
     * @param {{max?: number, value?: number}} progress
     */
    async loadAllFiles(progress={}) {
        progress.max=1.5;
        let zipFile=this.#zipFile;
        let ab=this.#ab=await new Promise(function(resolve, reject) {
            let r=new FileReader();
            r.onerror=()=>reject(r.error); // @ts-ignore
            r.onload=()=>resolve(r.result);
            r.onprogress=evt=>progress.value=evt.loaded/evt.total;
            r.readAsArrayBuffer(zipFile);
        });
        let searchStart=Math.max(0,this.#zipFile.size-65536-22);
        let searchRegion=new DataView(ab, searchStart);
        let centralDirectoryLength=0;
        let centralFileHeader=0;
        for(let i=searchRegion.byteLength-22; i>=-1; i--) {
            if(i<0) throw new DOMException("Invalid ZIP file - can't find header", "SyntaxError");
            if(searchRegion.getUint32(i,true)!==0x06054b50) continue;
            if(searchRegion.getUint16(i+20,true)!==searchRegion.byteLength-(i+22)) continue;
            centralFileHeader=searchRegion.getUint32(i+16,true);
            if(new DataView(ab, centralFileHeader).getUint32(0,true)!==0x02014b50) continue;
            centralDirectoryLength=searchRegion.getUint16(i+10,true);
            break;
        }
        const firstCentralFileHeader=centralFileHeader;
        this.#centralDirectory=new DataView(ab, firstCentralFileHeader);
        /** @type {{[path: string]: {offset: number, compSize: number, realSize: number, cdirOffset: number}}} */
        let files=Object.create(null);
        let textDecoder=new TextDecoder("utf-8", {ignoreBOM: true, fatal: false});
        let timer=performance.now();
        for(let i=0; i<centralDirectoryLength; i++) {
            if(i%100==0&&performance.now()-timer>50) {
                await new Promise(res=>setTimeout(res,0));
            }
            progress.value=1+i/centralDirectoryLength/2;
            searchRegion=new DataView(ab, centralFileHeader);
            if(searchRegion.getUint32(0,true)!==0x02014b50) throw new DOMException("Invalid ZIP file - can't find header", "SyntaxError");
            let filenameLength=searchRegion.getUint16(28,true);
            let offset=46+filenameLength+searchRegion.getUint16(30,true)+searchRegion.getUint16(32,true);
            let filenameU8A=new Uint8Array(ab, centralFileHeader+46, filenameLength);
            let filename=textDecoder.decode(filenameU8A);
            files[filename]={offset: searchRegion.getUint32(42,true), compSize: searchRegion.getUint32(20,true), realSize: searchRegion.getUint32(24,true), cdirOffset: centralFileHeader-firstCentralFileHeader};
            centralFileHeader+=offset;
        }
        progress.value=progress.max;
        this.#files=files;
    }
    /**
     * @param {{max?: number, value?: number}} progress
     */
    async loadMetadata(progress={}) {
        let searchStart=Math.max(0,this.#zipFile.size-65536-22);
        let searchRegion=new DataView(await this.#zipFile.slice(searchStart).arrayBuffer());
        let centralDirectoryLength=0;
        let centralFileHeader=0;
        for(let i=searchRegion.byteLength-22; i>=-1; i--) {
            if(i<0) throw new DOMException("Invalid ZIP file - can't find header", "SyntaxError");
            if(searchRegion.getUint32(i,true)!==0x06054b50) continue;
            if(searchRegion.getUint16(i+20,true)!==searchRegion.byteLength-(i+22)) continue;
            centralFileHeader=searchRegion.getUint32(i+16,true);
            if(new DataView(await this.#zipFile.slice(centralFileHeader, centralFileHeader+4).arrayBuffer()).getUint32(0,true)!==0x02014b50) continue;
            centralDirectoryLength=searchRegion.getUint16(i+10,true);
            break;
        }
        const firstCentralFileHeader=centralFileHeader;
        const ab=await this.#zipFile.slice(firstCentralFileHeader).arrayBuffer();
        this.#centralDirectory=new DataView(ab, 0);
        centralFileHeader-=firstCentralFileHeader;
        /** @type {{[path: string]: {offset: number, compSize: number, realSize: number, cdirOffset: number}}} */
        let files=Object.create(null);
        let textDecoder=new TextDecoder("utf-8", {ignoreBOM: true, fatal: false});
        progress.max=centralDirectoryLength;
        let timer=performance.now();
        for(let i=0; i<centralDirectoryLength; i++) {
            if(i%100==0&&performance.now()-timer>50) {
                await new Promise(res=>setTimeout(res,0));
            }
            progress.value=i;
            searchRegion=new DataView(ab, centralFileHeader);
            if(searchRegion.getUint32(0,true)!==0x02014b50) throw new DOMException("Invalid ZIP file - can't find header", "SyntaxError");
            let filenameLength=searchRegion.getUint16(28,true);
            let offset=46+filenameLength+searchRegion.getUint16(30,true)+searchRegion.getUint16(32,true);
            let filenameU8A=new Uint8Array(ab, centralFileHeader+46, filenameLength);
            let filename=textDecoder.decode(filenameU8A);
            files[filename]={offset: searchRegion.getUint32(42,true), compSize: searchRegion.getUint32(20,true), realSize: searchRegion.getUint32(24,true), cdirOffset: centralFileHeader};
            centralFileHeader+=offset;
        }
        progress.value=progress.max;
        this.#files=files;
    }
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns if there is a file with this path
     */
    hasFile(path) {
        if(!this.#files) throw new DOMException("Metadata is not loaded", "InvalidStateError");
        return (this.root+path) in this.#files;
    }
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns the size of the file as if it was extracted
     */
    getFileSize(path) {
        if(!this.#files) throw new DOMException("Metadata is not loaded", "InvalidStateError");
        path=this.root+path;
        if(!(path in this.#files)) throw new DOMException("File not found", "NotFoundError");
        return this.#files[path].realSize;
    }
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns the size of the file as it's compressed in the zip now
     */
    getCompressedFileSize(path) {
        if(!this.#files) throw new DOMException("Metadata is not loaded", "InvalidStateError");
        path=this.root+path;
        if(!(path in this.#files)) throw new DOMException("File not found", "NotFoundError");
        return this.#files[path].compSize;
    }
    /**
     * Requires all files to be loaded
     * @param {string} path
     * @returns {ArrayBuffer} an ArrayBuffer with file content
     */
    getFileContent(path) {
        if(!this.#files) throw new DOMException("Metadata is not loaded", "InvalidStateError");
        path=this.root+path;
        if(!(path in this.#files)) throw new DOMException("File not found", "NotFoundError");
        if(!this.#ab) throw new DOMException("Content is not loaded", "InvalidStateError");
        let fileInfo=this.#files[path];
        let dw=new DataView(this.#ab, fileInfo.offset);
        if(dw.getUint32(0,true)!==0x04034b50) throw new DOMException("Invalid ZIP file - can't find file", "SyntaxError");
        let version=dw.getUint16(4,true);
        if(version !== 10 && version !== 11 && version !== 20) throw new DOMException("Higher ZIP version required ("+version+")", "NotReadableError");
        let flags=dw.getUint16(6,true);
        let compressionMethod=dw.getUint16(8,true);
        if(compressionMethod !== 0 && compressionMethod !== 8) throw new DOMException("Compression "+compressionMethod+" is not supported", "NotReadableError");
        let compressedSize=dw.getUint32(18,true);
        let uncompressedSize=dw.getUint32(22,true);
        let offset=dw.getUint16(26,true)+dw.getUint16(28,true)+30;
        if(uncompressedSize !== fileInfo.realSize || compressedSize !== fileInfo.compSize) {
            if((flags&0x08) && uncompressedSize === 0 && compressedSize === 0 && dw.getUint32(offset+fileInfo.compSize, true) === 0x08074b50 && dw.getUint32(offset+fileInfo.compSize+8,true)===fileInfo.compSize && dw.getUint32(offset+fileInfo.compSize+12,true)===fileInfo.realSize) {
                uncompressedSize = fileInfo.realSize;
                compressedSize = fileInfo.compSize;
            }
            else throw new DOMException("Error in ZIP file - local and central headers don't agree on file size", "SyntaxError");
        }
        if(compressionMethod === 0) {
            return this.#ab.slice(fileInfo.offset+offset, fileInfo.offset+offset+(compressedSize||uncompressedSize));
        }
        else {
            let result=new ArrayBuffer(uncompressedSize);
            if(Deflate.decode(new Uint8Array(this.#ab, fileInfo.offset+offset, compressedSize), result) !== uncompressedSize) throw new DOMException("Error in ZIP file - wrong uncompressed data size", "SyntaxError");
            return result;
        }
    }
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns {Promise<ArrayBuffer>}
     */
    async getFileContentAsync(path) {
        if(!this.#files) throw new DOMException("Metadata is not loaded", "InvalidStateError");
        if(this.#ab) return this.getFileContent(path);
        path=this.root+path;
        if(!(path in this.#files)) throw new DOMException("File not found", "NotFoundError");
        let fileInfo=this.#files[path];
        let ab=await this.#zipFile.slice(fileInfo.offset, fileInfo.offset+32).arrayBuffer();
        let dw=new DataView(ab);
        if(dw.getUint32(0,true)!==0x04034b50) throw new DOMException("Invalid ZIP file - can't find file", "SyntaxError");
        let version=dw.getUint16(4,true);
        if(version !== 10 && version !== 11 && version !== 20) throw new DOMException("Higher ZIP version required ("+version+")", "NotReadableError");
        let flags=dw.getUint16(6,true);
        let compressionMethod=dw.getUint16(8,true);
        if(compressionMethod !== 0 && compressionMethod !== 8) throw new DOMException("Compression "+compressionMethod+" is not supported", "NotReadableError");
        let compressedSize=dw.getUint32(18,true);
        let uncompressedSize=dw.getUint32(22,true);
        if(uncompressedSize !== fileInfo.realSize || compressedSize !== fileInfo.compSize) {
            if((flags&0x08) && uncompressedSize === 0 && compressedSize === 0) { // can't test the end of the file
                uncompressedSize = fileInfo.realSize;
                compressedSize = fileInfo.compSize;
            }
            else throw new DOMException("Error in ZIP file - local and central headers don't agree on file size", "SyntaxError");
        }
        let offset=dw.getUint16(26,true)+dw.getUint16(28,true)+30;
        if(compressionMethod === 0) {
            return await this.#zipFile.slice(fileInfo.offset+offset, fileInfo.offset+offset+(compressedSize||uncompressedSize)).arrayBuffer();
        }
        else {
            let result=new ArrayBuffer(uncompressedSize);
            if(Deflate.decode(await this.#zipFile.slice(fileInfo.offset+offset, fileInfo.offset+offset+compressedSize).arrayBuffer(), result) !== uncompressedSize) throw new DOMException("Error in ZIP file - wrong uncompressed data size", "SyntaxError");
            return result;
        }
    }
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns {DataView}
     */
    getRawCentralHeader(path) {
        if(!this.#files) throw new DOMException("Metadata is not loaded", "InvalidStateError");
        path=this.root+path;
        if(!(path in this.#files)) throw new DOMException("File not found", "NotFoundError");
        let fileInfo=this.#files[path];
        var dv = new DataView(this.#centralDirectory.buffer, this.#centralDirectory.byteOffset + fileInfo.cdirOffset);
        var length = 46 + dv.getUint16(28,true)+dv.getUint16(30,true)+dv.getUint16(32,true);
        return new DataView(dv.buffer, dv.byteOffset, length);
        //return dv.buffer.slice(dv.byteOffset, dv.byteOffset+length);
    }
    /**
     * Requires all files to be loaded
     * @param {string} path
     * @returns {ArrayBuffer} local header + raw (maybe compressed) file content
     */
    getRawFileData(path) {
        if(!this.#files) throw new DOMException("Metadata is not loaded", "InvalidStateError");
        path=this.root+path;
        if(!(path in this.#files)) throw new DOMException("File not found", "NotFoundError");
        if(!this.#ab) throw new DOMException("Content is not loaded", "InvalidStateError");
        let fileInfo=this.#files[path];
        let dw=new DataView(this.#ab, fileInfo.offset);
        if(dw.getUint32(0,true)!==0x04034b50) throw new DOMException("Invalid ZIP file - can't find file", "SyntaxError");
        let version=dw.getUint16(4,true);
        if(version !== 10 && version !== 11 && version !== 20) throw new DOMException("Higher ZIP version required ("+version+")", "NotReadableError");
        let flags=dw.getUint16(6,true);
        let compressedSize=dw.getUint32(18,true);
        let offset=dw.getUint16(26,true)+dw.getUint16(28,true)+30;
        if(compressedSize !== fileInfo.compSize) {
            if((flags&0x08) && compressedSize === 0 && dw.getUint32(offset+fileInfo.compSize, true) === 0x08074b50 && dw.getUint32(offset+fileInfo.compSize+8,true)===fileInfo.compSize) {
                compressedSize = fileInfo.compSize+12;
            }
            else throw new DOMException("Error in ZIP file - local and central headers don't agree on file size", "SyntaxError");
        }
        return this.#ab.slice(fileInfo.offset, fileInfo.offset+offset+compressedSize);
    }
    /**
     * Requires metadata to be loaded
     * @param {string} path
     * @returns {Promise<Blob>} local header + raw (maybe compressed) file content
     */
    async getRawFileDataBlobAsync(path) {
        if(!this.#files) throw new DOMException("Metadata is not loaded", "InvalidStateError");
        path=this.root+path;
        if(!(path in this.#files)) throw new DOMException("File not found", "NotFoundError");
        let fileInfo=this.#files[path];
        let dw=this.#ab?new DataView(this.#ab, fileInfo.offset):new DataView(await this.#zipFile.slice(fileInfo.offset,fileInfo.offset+32).arrayBuffer(),0);
        if(dw.getUint32(0,true)!==0x04034b50) throw new DOMException("Invalid ZIP file - can't find file", "SyntaxError");
        let version=dw.getUint16(4,true);
        if(version !== 10 && version !== 11 && version !== 20) throw new DOMException("Higher ZIP version required ("+version+")", "NotReadableError");
        let flags=dw.getUint16(6,true);
        let compressedSize=dw.getUint32(18,true);
        let offset=dw.getUint16(26,true)+dw.getUint16(28,true)+30;
        if(compressedSize !== fileInfo.compSize) {
            if((flags&0x08) && compressedSize === 0) {
                compressedSize = fileInfo.compSize+12;
            }
            else throw new DOMException("Error in ZIP file - local and central headers don't agree on file size", "SyntaxError");
        }
        return this.#zipFile.slice(fileInfo.offset, fileInfo.offset+offset+compressedSize);
    }
    /**
     * Requires metadata to be loaded
     * @param {string} path to the directory to list, must end with "/" if not empty
     */
    listDirectoryContent(path) {
        path=this.root+path;
        if(!path.endsWith("/") && path !== "") throw new DOMException("Path must end with '/'", "SyntaxError");
        let res=new Set();
        for(let name in this.#files) {
            if(!name.startsWith(path)) continue;
            name=name.slice(path.length);
            let i=name.indexOf("/");
            if(i===-1) res.add(name);
            else res.add(name.slice(0,i+1));
        }
        return [...res];
    }
}
Zip.utils=Object.freeze({
    /** @type {<T>(x: T) => T} */
    structuredClone: structuredClone.bind(null) || function(x) {return JSON.parse(JSON.stringify(x));}
});

/**
 * Allows copying and skipping a specific amount of bytes in a ReadableStream
 */
class StreamSlicer {
    /** @type {ReadableStream<Uint8Array>} */
    stream;
    /** @type {ReadableStreamDefaultReader<Uint8Array>} */
    reader;
    /** @type {Uint8Array} */
    chunk = new Uint8Array(0);
    /** @type {number} how many bytes were copied/skipped in the current chunk */
    offset = 0;
    /**
     * @param {ReadableStream<Uint8Array>} stream
     */
    constructor(stream) {
        this.stream = stream;
        this.reader = stream.getReader();
    }
    /**
     * @param {number} n number of bytes to copy
     * @param {WritableStreamDefaultWriter} writer writer to write the copied bytes to
     */
    async copyNextNBytes(n, writer) {
        let copied = 0;
        while(copied < n) {
            if(this.chunk.length <= this.offset) {
                let res = await this.reader.read();
                if(res.done) throw new Error(`Couldn't read ${n} bytes because the stream ended after ${copied} bytes`);
                this.chunk = res.value;
                this.offset = 0;
            }
            let copyStep = Math.min(n - copied, this.chunk.length - this.offset);
            await writer.write(this.chunk.subarray(this.offset, this.offset + copyStep));
            this.offset += copyStep;
            copied += copyStep;
        }
    }
    /**
     * @param {number} n
     * @returns {Promise<Uint8Array>}
     */
    async getNextNBytes(n) {
        const u8a = new Uint8Array(n);
        let copied = 0;
        while(copied < n) {
            if(this.chunk.length <= this.offset) {
                let res = await this.reader.read();
                if(res.done) throw new Error(`Couldn't read ${n} bytes because the stream ended after ${copied} bytes`);
                this.chunk = res.value;
                this.offset = 0;
            }
            let copyStep = Math.min(n - copied, this.chunk.length - this.offset);
            u8a.set(this.chunk.subarray(this.offset, this.offset + copyStep), copied);
            this.offset += copyStep;
            copied += copyStep;
        }
        return u8a;
    }
    /**
     * @param {number} n number of bytes to skip
     */
    async skipNextNBytes(n) {
        let skipped = 0;
        while(skipped < n) {
            if(this.chunk.length <= this.offset) {
                let res = await this.reader.read();
                if(res.done) return;
                this.chunk = res.value;
                this.offset = 0;
            }
            let step = Math.min(n - skipped, this.chunk.length - this.offset);
            this.offset += step;
            skipped += step;
        }
    }
    releaseStream() {
        this.reader.releaseLock();
    }
    async cancelStream() {
        await this.reader.cancel();
    }
}

/**
 * Makes an uncompressed zip file
 */
class ZipMaker {
    tr = new TransformStream();
    result = new Response(this.tr.readable).blob();
    /** @type {({offset:number,size:number,crc:number,name:string}|{offset:number,cdir:DataView})[]} */
    files = [];
    offset = 0;
    async addFile(/** @type {Blob} */ file, /** @type {string} */ name) {
        if(typeof name !== "string") throw new TypeError("File name must be a string");
        var localHeader = new DataView(new ArrayBuffer(30+name.length));
        localHeader.setUint32(0, 0x04034b50, true); // magic: local file header
        localHeader.setUint16(4, 10, true); // version needed to extract
        localHeader.setUint16(6, 0, true); // flags
        localHeader.setUint16(8, 0, true); // compression = not compressed
        localHeader.setUint16(10, 0, true); // time = ?
        localHeader.setUint16(12, 0, true); // date = ?
        // localHeader.setInt32(14, crc, true); crc isn't known yet, set it later
        localHeader.setUint32(18, file.size, true); // compressed size
        localHeader.setUint32(22, file.size, true); // uncompressed size
        localHeader.setUint16(26, name.length, true); // file name length
        localHeader.setUint16(28, 0, true); // extra fields length
        for(let i=0; i<name.length; i++) {
            localHeader.setUint8(30+i, name.charCodeAt(i));
        }
        let crc = 0;
        var stream = file.stream();
        var reader = stream.getReader();
        for(var thing = await reader.read(); !thing.done; thing = await reader.read()) {
            crc = Gzip.crc.update_crc(crc, thing.value);
        }
        localHeader.setInt32(14, crc, true); // crc
        var writer = this.tr.writable.getWriter();
        await writer.write(new Uint8Array(localHeader.buffer));
        writer.releaseLock();
        await file.stream().pipeTo(this.tr.writable, {"preventClose": true});
        this.files.push({offset: this.offset, size: file.size, name, crc});
        this.offset+=30+name.length+file.size;
    }
    async copyFile(/** @type {Zip} */ zip, /** @type {string} */ path) {
        var blob = await zip.getRawFileDataBlobAsync(path);
        await blob.stream().pipeTo(this.tr.writable, {"preventClose": true});
        this.files.push({offset: this.offset, cdir: zip.getRawCentralHeader(path)});
        this.offset += blob.size;
    }
    async copyFiles(/** @type {Zip} */ zip, /** @type {Iterable<string>} */ _paths, progressElem = {}) {
        const writer = this.tr.writable.getWriter();
        const files = zip._getAllMetadata();
        const paths = [...new Set(_paths)];
        if(paths.length === 0) return;
        paths.sort((a, b)=>files[a].offset-files[b].offset);
        let readOffset = files[paths[0]].offset;
        let copier = new StreamSlicer(zip.zipFile.slice(readOffset).stream());
        let SKIP_TRESHOLD = 10_000_000; // remake stream only if we are skipping more than 10MB
        progressElem.max = zip.zipFile.size;
        progressElem.value = 0;
        for(let i=0; i<paths.length; i++) {
            let fileInfo = files[paths[i]];
            if(fileInfo.offset - readOffset > SKIP_TRESHOLD) {
                copier.cancelStream();
                readOffset = fileInfo.offset;
                copier = new StreamSlicer(zip.zipFile.slice(readOffset).stream());
            }
            await copier.skipNextNBytes(fileInfo.offset - readOffset);
            readOffset = fileInfo.offset;
            let localHeaderU8a = await copier.getNextNBytes(30);
            readOffset+=30;
            let dw = new DataView(localHeaderU8a.buffer, localHeaderU8a.byteOffset, localHeaderU8a.byteLength);
            if(dw.getUint32(0,true)!==0x04034b50) throw new DOMException("Invalid ZIP file - can't find file", "SyntaxError");
            let version=dw.getUint16(4,true);
            if(version !== 10 && version !== 11 && version !== 20) throw new DOMException("Higher ZIP version required ("+version+")", "NotReadableError");
            let flags=dw.getUint16(6,true);
            let compressedSize=dw.getUint32(18,true);
            let plusSize=dw.getUint16(26,true)+dw.getUint16(28,true);
            if(compressedSize !== fileInfo.compSize) {
                if((flags&0x08) && compressedSize === 0) {
                    compressedSize = fileInfo.compSize;
                    plusSize += 12;
                }
                else throw new DOMException("Error in ZIP file - local and central headers don't agree on file size", "SyntaxError");
            }
            await writer.write(localHeaderU8a);
            await copier.copyNextNBytes(compressedSize + plusSize, writer);
            readOffset += compressedSize + plusSize;
            this.files.push({offset: this.offset, cdir: zip.getRawCentralHeader(paths[i])});
            this.offset += 30 + compressedSize + plusSize;
            progressElem.value = readOffset;
        }
        copier.cancelStream();
        writer.releaseLock();
        progressElem.value = zip.zipFile.size;
    }
    async generateZip() {
        var cdirlen = 22;
        for(let f of this.files) {
            cdirlen+=("cdir" in f)?f.cdir.byteLength:(46+f.name.length);
        }
        var cdir = new ArrayBuffer(cdirlen);
        cdirlen=0;
        for(let f of this.files) {
            var dv=new DataView(cdir, cdirlen);
            if("cdir" in f) {
                new Uint8Array(cdir, cdirlen).set(new Uint8Array(f.cdir.buffer, f.cdir.byteOffset, f.cdir.byteLength));
                cdirlen+=f.cdir.byteLength;
            }
            else {
                dv.setUint32(0, 0x02014b50, true); // magic: central directory entry
                dv.setUint16(4, 20, true); // version made by
                dv.setUint16(6, 10, true); // version needed to extract
                dv.setUint16(8, 0, true); // flags
                dv.setUint16(10, 0, true); // compression = not compressed
                dv.setUint16(12, 0, true); // time = ?
                dv.setUint16(14, 0, true); // date = ?
                dv.setInt32(16, f.crc, true); // crc
                dv.setUint32(20, f.size, true); // compressed size
                dv.setUint32(24, f.size, true); // uncompressed size
                dv.setUint16(28, f.name.length, true); // name length
                dv.setUint16(30, 0, true); // extra field length
                dv.setUint16(32, 0, true); // comment length
                dv.setUint16(34, 0, true); // disk
                dv.setUint16(36, 0, true); // internal attributes = ?
                dv.setUint32(38, 0, true); // external attributes = ?
                for(let i=0; i<f.name.length; i++) {
                    dv.setUint8(46+i, f.name.charCodeAt(i));
                }
                cdirlen+=46+f.name.length;
            }
            dv.setUint32(42, f.offset, true); // offset of local header
        }
        var dv=new DataView(cdir, cdirlen);
        dv.setUint32(0, 0x06054b50, true); // magic: end of central directory record
        dv.setUint16(4, 0, true); // num of this disk
        dv.setUint16(6, 0, true); // num of start disk
        dv.setUint16(8, this.files.length, true); // # of C.D. entries on this disk
        dv.setUint16(10, this.files.length, true); // # of C.D. entries = # of files
        dv.setUint32(12, cdir.byteLength-22, true); // size of the central directory
        dv.setUint32(16, this.offset, true); // offset of the start of the central directory
        dv.setUint16(20, 0, true); // length of the file comment
        var writer = this.tr.writable.getWriter();
        await writer.write(new Uint8Array(cdir));
        await writer.close();
        return await this.result;
    }
}
