// In-memory portfolio store, keyed by user. Product state the engine doesn't
// hold (the engine is stateless per request). Swap for a DB in production.
const byUser = new Map();

function key(user) {
  return user || 'default';
}

export const portfolio = {
  list(user) {
    return byUser.get(key(user)) || [];
  },

  add(user, entry) {
    const arr = byUser.get(key(user)) || [];
    const item = {
      id: `pf_${arr.length + 1}_${entry.dsl?.name?.replace(/\W+/g, '-').toLowerCase() || 'strategy'}`,
      dsl: entry.dsl,
      capital: Number(entry.capital) || 10000,
      added_at: new Date().toISOString(),
    };
    arr.push(item);
    byUser.set(key(user), arr);
    return item;
  },

  remove(user, id) {
    const arr = byUser.get(key(user)) || [];
    const next = arr.filter((x) => x.id !== id);
    byUser.set(key(user), next);
    return next.length !== arr.length;
  },
};
