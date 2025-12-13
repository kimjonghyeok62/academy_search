export function groupBy(arr, keyFn) {
  return arr.reduce((acc, cur) => {
    const k = keyFn(cur);
    acc[k] = acc[k] || [];
    acc[k].push(cur);
    return acc;
  }, {});
}
