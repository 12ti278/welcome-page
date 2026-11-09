/* ============================================================
   站点内容数据客户端
   数据 Source of Truth：仓库里的 data/site-data.json
   本机 localStorage 只做缓存，让首屏（尤其 3D 胶带）不用干等网络。
   ============================================================ */
(function (global) {
  'use strict';

  var SRC = 'data/site-data.json';
  var KEY = 'hjSiteDataCache:v1';

  function normalize(d) {
    if (!d || typeof d !== 'object' || d.version !== 1) return null;
    if (!Array.isArray(d.works)) d.works = [];
    if (!Array.isArray(d.projects)) d.projects = [];
    if (!d.modules || typeof d.modules !== 'object') d.modules = {};
    if (!d.home || typeof d.home !== 'object') d.home = {};
    return d;
  }

  function cached() {
    try {
      return normalize(JSON.parse(global.localStorage.getItem(KEY) || 'null'));
    } catch (e) {
      return null;
    }
  }

  function cache(d) {
    try { global.localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }

  function clearCache() {
    try { global.localStorage.removeItem(KEY); } catch (e) {}
  }

  function fetchFresh(timeout) {
    timeout = timeout || 3000;
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { done(null); }, timeout);
      function done(d) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(d);
      }
      if (typeof global.fetch !== 'function') return done(null);
      global.fetch(SRC + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (d) {
          d = normalize(d);
          if (d) cache(d);
          done(d);
        })
        .catch(function () { done(null); });
    });
  }

  /* 先回调本机缓存（如果有），再回调线上最新数据（有变化时）。
     回调可能执行两次，接入方需要保证 apply 是幂等的。 */
  function onData(timeout, cb) {
    var c = cached();
    if (c) cb(c, 'cache');
    fetchFresh(timeout).then(function (d) {
      if (d && (!c || d.updatedAt !== c.updatedAt)) cb(d, 'fresh');
    });
  }

  /* 等最新数据，超时则退回缓存；只回调一次。 */
  function once(timeout, cb) {
    var c = cached();
    fetchFresh(timeout).then(function (d) { cb(d || c); });
  }

  global.HJSiteData = {
    cached: cached,
    fetchFresh: fetchFresh,
    onData: onData,
    once: once,
    clearCache: clearCache,
    cacheKey: KEY
  };
})(window);
