// The DataView fences: `.buffer` escaping the one composed position that
// consumes it and a constructor
// over something that isn't a typed array's `.buffer`.

const buf = new Uint8Array(8);
const view = new DataView(buf.buffer);

// '.buffer' only compiles inside new DataView(x.buffer, ...).
const escaped = buf.buffer;

// The constructor wants a typed array's own '.buffer'.
const ab = new ArrayBuffer(8);
const direct = new DataView(ab);
void view;
