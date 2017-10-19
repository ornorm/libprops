/** @babel */
import * as char from 'hjs-core/lib/char';
import * as util from 'hjs-core/lib/util';
import {ByteBuffer} from 'hjs-io/lib/buffer';
import {ByteArrayInputStream,InputStream} from 'hjs-io/lib/input';
import {Reader} from 'hjs-io/lib/reader';
import {Hashtable} from 'hjs-collection/lib/table';
import {UNKNOWN_TYPE,EventListener,EventObject} from 'eventslib/lib/events';
import {EventListenerAggregate} from 'eventslib/lib/aggregate';
import {ARRAY_BUFFER,DOCUMENT,GET,LOAD_END_STATE,HTTPConnection} from 'libhttp/lib/http';

export class LineReader {

    constructor({ input = null, reader = null }) {
        if (input === null && reader === null) {
            throw new ReferenceError('NullPointerException');
        }
        if (input instanceof InputStream) {
            this.input = input;
            this.inByteBuf = ByteBuffer.createBuffer({ capacity: 8192 });
        }
        if (reader instanceof Reader) {
            this.reader = reader;
            this.inCharBuf = ByteBuffer.createBuffer({ capacity: 8192 });
        }
        this.lineBuf = ByteBuffer.createBuffer({ capacity: 1024 });
        this.inLimit = 0;
        this.inOff = 0;
    }

    readLine() {
        let c = 0;
        let len = 0;
        let isNewLine = true;
        let skipWhiteSpace = true;
        let isCommentLine = false;
        let appendedLineBegin = false;
        let precedingBackslash = false;
        let skipLF = false;
        while (true) {
            if (this.inOff >= this.inLimit) {
                this.inLimit = this.input === null ?
                    this.reader.read(this.inCharBuf) :
                    this.input.read(this.inByteBuf);
                this.inOff = 0;
                if (this.inLimit <= 0) {
                    if (len === 0 || isCommentLine) {
                        return -1;
                    }
                    return len;
                }
            }
            if (this.input !== null) {
                //The line below is equivalent to calling a
                //ISO8859-1 decoder.
                c = (0xff & this.inByteBuf[this.inOff++]);
            } else {
                c = this.inCharBuf[this.inOff++];
            }
            if (skipLF) {
                skipLF = false;
                if (c === char.NEWLINE) {
                    continue;
                }
            }
            if (skipWhiteSpace) {
                if (char.WHITE_SPACE === c) {
                    continue;
                }
                if (!appendedLineBegin &&
                    (c === char.CARRIAGE_RETURN || c === char.NEWLINE)) {
                    continue;
                }
                skipWhiteSpace = false;
                appendedLineBegin = false;
            }
            if (isNewLine) {
                isNewLine = false;
                if (c === char.SHARP || c === char.BANG) {
                    isCommentLine = true;
                    continue;
                }
            }
            if (c !== char.NEWLINE && c !== char.CARRIAGE_RETURN) {
                this.lineBuf[len++] = c;
                if (len === this.lineBuf.length) {
                    let newLength = this.lineBuf.length * 2;
                    if (newLength < 0) {
                        newLength = Number.MAX_VALUE;
                    }
                    let buf = ByteBuffer.createBuffer({capacity:newLength});
                    util.arraycopy(this.lineBuf, 0, buf, 0, this.lineBuf.length);
                    this.lineBuf = buf;
                }
                //flip the preceding backslash flag
                if (c === char.BACK_SLASH) {
                    precedingBackslash = !precedingBackslash;
                } else {
                    precedingBackslash = false;
                }
            } else {
                // reached EOL
                if (isCommentLine || len === 0) {
                    isCommentLine = false;
                    isNewLine = true;
                    skipWhiteSpace = true;
                    len = 0;
                    continue;
                }
                if (this.inOff >= this.inLimit) {
                    this.inLimit = this.input === null ?
                        this.reader.read(this.inCharBuf) :
                        this.input.read(this.inByteBuf);
                    this.inOff = 0;
                    if (this.inLimit <= 0) {
                        return len;
                    }
                }
                if (precedingBackslash) {
                    len -= 1;
                    //skip the leading whitespace characters in following line
                    skipWhiteSpace = true;
                    appendedLineBegin = true;
                    precedingBackslash = false;
                    if (c === char.CARRIAGE_RETURN) {
                        skipLF = true;
                    }
                } else {
                    return len;
                }
            }
        }
    }
}

export class PropertiesEvent extends EventObject {

    constructor({source, id = 601, priority = 0, data = null, when = Date.now()} = {}) {
        super({source,id,priority,data,when});
    }

    consume() {
        switch (this.id) {
            case PropertiesEvent.PROPERTIES_EVENT_IMPORTED:
            case PropertiesEvent.PROPERTIES_EVENT_ERROR:
                this.consumed = true;
                break;
            default:
                this.consumed = false;
                break;
        }
    }

    getException() {
        let data = this.getData();
        if (data !== null &&
            data.hasOwnProperty('exception') &&
            data.exception) {
            return data.exception;
        }
        return null;
    }

    paramString() {
        let typeStr;
        switch (this.id) {
            case PropertiesEvent.PROPERTIES_EVENT_IMPORTED:
                typeStr = 'PROPERTIES_EVENT_IMPORTED';
                break;
            case PropertiesEvent.PROPERTIES_EVENT_ERROR:
                typeStr = 'PROPERTIES_EVENT_ERROR';
                break;
            default:
                typeStr = UNKNOWN_TYPE;
        }
        return `${typeStr},
                when=${this.when},
                priority=${this.priority},
                posted=${this.posted},
                consumed=${this.consumed}
                `;
    }

}

PropertiesEvent.PROPERTIES_EVENT_FIRST = 600;
PropertiesEvent.PROPERTIES_EVENT_IMPORTED = PropertiesEvent.PROPERTIES_EVENT_FIRST + 1;
PropertiesEvent.PROPERTIES_EVENT_ERROR = PropertiesEvent.PROPERTIES_EVENT_FIRST + 2;
PropertiesEvent.PROPERTIES_EVENT_LAST = PropertiesEvent.PROPERTIES_EVENT_ERROR;

export class PropertiesListener extends EventListener {

    constructor({ onPropertiesError = null, onPropertiesImported = null } = {}) {
        super();
        if (onPropertiesError !== null) {
            this.onPropertiesError = onPropertiesError;
        }
        if (onPropertiesImported !== null) {
            this.onPropertiesImported = onPropertiesImported;
        }
    }

    onPropertiesError(evt) {
    }

    onPropertiesImported(evt) {
    }
}

export class Properties extends Hashtable {

    constructor({initialCapacity = 11, loadFactor = 0.75, defaults = null} = {}) {
        super({initialCapacity,loadFactor});
        if (defaults !== null) {
            this.defaults = defaults;
        }
        this.mPropListeners = new EventListenerAggregate(PropertiesListener);
    }

    addPropertyListener(pl) {
        if (pl === null) {
            throw new ReferenceError("NullPointerException Property listener is null.");
        }
        this.mPropListeners.add(pl);
    }

    enumerate(h) {
        if (this.defaults !== null) {
            this.defaults.enumerate(h);
        }
        let e = this.keys();
        while (e.hasMoreElements()) {
            let key = e.nextElement();
            h.put(key, this.get(key));
        }
    }

    enumerateStringProperties(h) {
        if (this.defaults !== null) {
            this.defaults.enumerateStringProperties(h);
        }
        let e = this.keys();
        while (e.hasMoreElements()) {
            let k = e.nextElement();
            let v = this.get(k);
            if (typeof k === "string" &&
                typeof v === "string") {
                h.put(k, v);
            }
        }
    }

    getProperty(key, defaultValue) {
        if (this.defaults !== null) {
            let val = this.getProperty(key);
            return val !== null ? defaultValue : val;
        }
        let oval = this.get(key);
        let sval = (typeof oval === "string") ? oval : null;
        return (sval === null && this.defaults !== null) ? this.defaults.getProperty(key) : sval;
    }

    load(url) {
        let isXml = char.endsWith(url, ".xml");
        let type = isXml ? DOCUMENT : ARRAY_BUFFER;
        new HTTPConnection({
            url: url,
            method: GET,
            responseType: type,
            handlers: {
                onHandleRequest: (event) => {
                    let type = event.type;
                    let response = event.response;
                    if (type === LOAD_END_STATE) {
                        if (!response.hasError()) {
                            if (isXml) {
                                this.loadFromXML(response.getMessageBody());
                            } else {
                                this.loadFromInputStream(new ByteArrayInputStream({
                                    input : ByteBuffer.createBuffer({ buffer: response.getMessageBody() })
                                }));
                            }
                            this.notifyImported();
                        } else {
                            this.notifyError(response.getException());
                        }
                    }
                }
            }
        });
    }

    loadConvert(input, off, len) {
        let aChar;
        let end = off + len;
        let convtBuf = "";
        while (off < end) {
            aChar = input[off++];
            if (aChar === char.BACK_SLASH) {
                aChar = input[off++];
                if(aChar === char.u) {
                    // Read the xxxx
                    let value=0;
                    for (let i=0; i<4; i++) {
                        aChar = input[off++];
                        switch (aChar) {
                            case char.ZERO: case char.ONE: case char.TWO: case char.THREE: case char.FOUR:
                            case char.FIVE: case char.SIX: case char.SEVEN: case char.EIGHT: case char.NINE:
                            value = (value << 4) + aChar - char.ZERO;
                            break;
                            case char.a: case char.b: case char.c:
                            case char.d: case char.e: case char.f:
                            value = (value << 4) + 10 + aChar - char.a;
                            break;
                            case char.A: case char.B: case char.C:
                            case char.D: case char.E: case char.F:
                            value = (value << 4) + 10 + aChar - char.A;
                            break;
                            default:
                                throw new SyntaxError("IllegalArgumentException Malformed \\uxxxx encoding.");
                        }
                    }
                    convtBuf += String.fromCharCode(value);
                } else {
                    if (aChar === char.t) aChar = char.TAB;
                    else if (aChar === char.r) aChar = char.CARRIAGE_RETURN;
                    else if (aChar === char.n) aChar = char.NEWLINE;
                    else if (aChar === char.f) aChar = char.FORMFEED;
                    convtBuf += String.fromCharCode(aChar);
                }
            } else {
                if (aChar === char.NULL_TERMINATOR) {
                    break;
                } else {
                    convtBuf += String.fromCharCode(aChar);
                }
            }
        }
        return convtBuf;
    }

    loadFromInputStream(input) {
        this.loadInternal(new LineReader({ input: input }));
    }

    loadInternal(lr) {
        let limit;
        let keyLen;
        let hasSep;
        let valueStart;
        let precedingBackslash;
        while ((limit = lr.readLine()) >= 0) {
            let c = 0;
            keyLen = 0;
            valueStart = limit;
            hasSep = false;
            precedingBackslash = false;
            while (keyLen < limit) {
                c = lr.lineBuf[keyLen];
                //need check if escaped.
                if ((c === char.EQUAL || c === char.COLON) && !precedingBackslash) {
                    valueStart = keyLen + 1;
                    hasSep = true;
                    break;
                } else if (char.WHITE_SPACE === c && !precedingBackslash) {
                    valueStart = keyLen + 1;
                    break;
                }
                if (c === char.BACK_SLASH) {
                    precedingBackslash = !precedingBackslash;
                } else {
                    precedingBackslash = false;
                }
                keyLen++;
            }
            while (valueStart < limit) {
                c = lr.lineBuf[valueStart];
                if (char.WHITE_SPACE !== c) {
                    if (!hasSep && (c === char.EQUAL ||  c === char.COLON)) {
                        hasSep = true;
                    } else {
                        break;
                    }
                }
                valueStart++;
            }
            let key = this.loadConvert(lr.lineBuf, 0, keyLen);
            let value = this.loadConvert(lr.lineBuf, valueStart, limit - valueStart);
            this.put(key, value);
        }
    }

    loadFromReader(reader) {
        this.loadInternal(new LineReader({ reader: reader }));
    }

    loadFromXML(xmlDoc) {
        let entries = xmlDoc.getElementsByTagName("entry");
        let len = entries.length;
        let node = null;
        while (len--) {
            node = entries[len];
            this.put(node.getAttribute("key"), node.textContent);
        }
    }

    notifyError(error) {
        let listeners = this.mPropListeners.getListenersInternal();
        let evt = new PropertiesEvent({ source : this, id : PropertiesEvent.PROPERTIES_EVENT_ERROR, data : { exception: error } });
        for (const listener of listeners) {
            listener.onPropertiesError(evt);
        }
    }

    notifyImported() {
        let listeners = this.mPropListeners.getListenersInternal();
        let evt = new PropertiesEvent({ source : this, id : PropertiesEvent.PROPERTIES_EVENT_IMPORTED });
        for (const listener of listeners) {
            listener.onPropertiesImported(evt);
        }
    }

    propertyNames() {
        let h = new Hashtable();
        this.enumerate(h);
        return h.keys();
    }

    removePropertyListener(pl) {
        if (pl === null) {
            throw new ReferenceError("NullPointerException Property listener is null.");
        }
        this.mPropListeners.remove(pl);
    }

    setProperty(key, value) {
        return this.put(key, value);
    }

    stringPropertyNames() {
        let h = new Hashtable();
        this.enumerateStringProperties(h);
        return h.keySet();
    }

    static toHex(nibble) {
        return char.HEX_DIGITS[(nibble & 0xF)];
    }

}