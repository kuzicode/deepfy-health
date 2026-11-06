// 内存限流（单实例部署足够，重启清零）：按累计量的预算、同时进行的请求数。按次数限速用 createLimiter

/** 滑动窗口内的累计量预算；超出时不计入，返回 false */
export function createBudget(windowMs: number) {
  const spent = new Map<string, { t: number; n: number }[]>();
  return (key: string, amount: number, max: number, now = Date.now()) => {
    const recent = (spent.get(key) ?? []).filter((e) => now - e.t < windowMs);
    const used = recent.reduce((a, e) => a + e.n, 0);
    const ok = used + amount <= max;
    if (ok) recent.push({ t: now, n: amount });
    if (recent.length) spent.set(key, recent);
    else spent.delete(key);
    return ok;
  };
}

/** 同时进行的请求数：每个 key 和全站各有上限。enter 返回 true 后必须调用 leave */
export function createGate(perKey: number, total: number) {
  const running = new Map<string, number>();
  let all = 0;
  return {
    enter(key: string) {
      const mine = running.get(key) ?? 0;
      if (mine >= perKey || all >= total) return false;
      running.set(key, mine + 1);
      all++;
      return true;
    },
    leave(key: string) {
      const mine = (running.get(key) ?? 1) - 1;
      if (mine > 0) running.set(key, mine);
      else running.delete(key);
      all--;
    },
  };
}
