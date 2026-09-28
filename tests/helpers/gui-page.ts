const MODULE_LABEL = /^\/\/ (?:src|next)\/[^\n]*\.ts\n/m;

export function normalizePage(html: string, token: string) {
  const pieces = html.replaceAll(token, '<token>').split(MODULE_LABEL);
  return {
    head: pieces[0],
    modules: pieces.slice(1, -1).map(() => '[bundle]'),
    tail: (pieces[pieces.length - 1] ?? '').replace(/[\s\S]*\n(?= {2}<\/script>)/, '[bundle]\n'),
  };
}
