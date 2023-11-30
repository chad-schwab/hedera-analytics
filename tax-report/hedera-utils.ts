export function dateToHederaTs(date: Date, maxNanos: boolean) {
  const millisecondString = `${date.getTime()}`;
  let hederaString = `${millisecondString.slice(0, millisecondString.length - 3)}.${millisecondString.slice(millisecondString.length - 3)}`;
  if (maxNanos) {
    hederaString += "999999";
  } else {
    hederaString += "000000";
  }
  return hederaString;
}
export function hederaTsToDate(hederaTs: string) {
  return new Date(parseInt(hederaTs.split(".")[0], 10) * 1000);
}
export function tinyToHbar(tinyBar: number) {
  return tinyBar / 100000000;
}
