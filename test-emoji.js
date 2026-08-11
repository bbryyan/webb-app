function encodeEmojis(str) {
  if (!str) return str;
  return str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, match => encodeURIComponent(match));
}

function decodeEmojis(str) {
  if (!str) return str;
  return str.replace(/(%[0-9A-F]{2})+/ig, match => {
    try {
      return decodeURIComponent(match);
    } catch(e) {
      return match;
    }
  });
}

console.log(encodeEmojis("Hello 👍 world 😂!"));
console.log(decodeEmojis(encodeEmojis("Hello 👍 world 😂!")));
console.log(decodeEmojis("I am 100% sure"));
console.log(decodeEmojis("What about %20 space?"));
