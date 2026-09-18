const firstOverflowingWasm32Width = 0xffffffe1;
const maxWasm32Width = 0xffffffff;
let checked = 0;

for (let width = firstOverflowingWasm32Width; width <= maxWasm32Width; width++) {
  if (BigInt.asUintN(width, 1n) !== 1n) throw new Error(`asUintN ${width}`);
  if (BigInt.asIntN(width, -1n) !== -1n) throw new Error(`asIntN ${width}`);
  checked++;
}

console.log("wasm32-width-boundaries", checked, BigInt.asUintN(maxWasm32Width, 1n), BigInt.asIntN(maxWasm32Width, -1n));
