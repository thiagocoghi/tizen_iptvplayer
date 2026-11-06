/*
 * services/storage.js
 * Persistência local: contas/listas (Xtream e M3U), favoritos por categoria
 * e histórico dos últimos 5 itens assistidos.
 * Chaves: iptv_accounts, iptv_favorites, iptv_recent_history, iptv_active_account
 */
(function (global) {
    'use strict';

    var KEYS = {
        accounts: 'iptv_accounts',
        favorites: 'iptv_favorites',
        recent: 'iptv_recent_history',
        active: 'iptv_active_account',
        streamFormat: 'iptv_stream_format',
        seeded: 'iptv_seeded_accounts'
    };

    var MAX_RECENT = 5;

    function read(key, fallback) {
        try {
            var raw = global.localStorage.getItem(key);
            if (!raw) return fallback;
            var value = JSON.parse(raw);
            return (value === null || value === undefined) ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            global.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('[storage] falha ao gravar ' + key, e);
            return false;
        }
    }

    function makeId(prefix) {
        return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function normalizeAccount(input) {
        var account = input || {};
        return {
            id: account.id || makeId('acc'),
            name: String(account.name || '').trim() || 'Minha lista',
            type: account.type === 'm3u' ? 'm3u' : 'xtream',
            url: String(account.url || '').trim().replace(/\/+$/, ''),
            username: String(account.username || '').trim(),
            password: String(account.password || ''),
            created_at: account.created_at || nowIso()
        };
    }

    function emptyFavorites() {
        return { live: [], movies: [], series: [] };
    }

    function favKey(item) {
        if (!item) return '';
        if (item.id !== undefined && item.id !== null && item.id !== '') return String(item.id);
        if (item.stream_id !== undefined) return String(item.stream_id);
        if (item.series_id !== undefined) return String(item.series_id);
        return '';
    }

    var Store = {
        KEYS: KEYS,
        MAX_RECENT: MAX_RECENT,

        /* ---------------- Contas / listas ---------------- */

        getAccounts: function () {
            var list = read(KEYS.accounts, []);
            return Array.isArray(list) ? list : [];
        },

        saveAccounts: function (list) {
            return write(KEYS.accounts, Array.isArray(list) ? list : []);
        },

        getAccount: function (id) {
            if (!id) return null;
            var list = this.getAccounts();
            for (var i = 0; i < list.length; i++) {
                if (String(list[i].id) === String(id)) return list[i];
            }
            return null;
        },

        upsertAccount: function (input) {
            var list = this.getAccounts();
            var account = normalizeAccount(input);
            var replaced = false;

            for (var i = 0; i < list.length; i++) {
                if (String(list[i].id) === String(account.id)) {
                    list[i] = account;
                    replaced = true;
                    break;
                }
            }
            if (!replaced) list.push(account);
            this.saveAccounts(list);
            return account;
        },

        deleteAccount: function (id) {
            var list = this.getAccounts().filter(function (acc) {
                return String(acc.id) !== String(id);
            });
            this.saveAccounts(list);
            if (String(read(KEYS.active, '')) === String(id)) {
                this.setActiveAccount(list.length ? list[0].id : '');
            }
            return list;
        },

        getActiveAccount: function () {
            var id = read(KEYS.active, '');
            if (!id) {
                var list = this.getAccounts();
                return list.length ? list[0] : null;
            }
            return this.getAccount(id);
        },

        setActiveAccount: function (id) {
            if (!id) {
                try { global.localStorage.removeItem(KEYS.active); } catch (e) { /* ignore */ }
                return;
            }
            write(KEYS.active, id);
        },

        /* ---------------- Formato de vídeo ao vivo (automático) ---------------- */

        getStreamFormat: function (accountId) {
            var map = read(KEYS.streamFormat, {});
            var value = map && map[String(accountId)];
            return value === 'm3u8' ? 'm3u8' : 'ts';
        },

        setStreamFormat: function (accountId, format) {
            var map = read(KEYS.streamFormat, {});
            if (!map || typeof map !== 'object') map = {};
            map[String(accountId)] = format === 'm3u8' ? 'm3u8' : 'ts';
            write(KEYS.streamFormat, map);
        },

        /* ---------------- Favoritos ---------------- */

        getFavorites: function () {
            var favs = read(KEYS.favorites, emptyFavorites());
            if (!favs || typeof favs !== 'object') favs = emptyFavorites();
            favs.live = Array.isArray(favs.live) ? favs.live : [];
            favs.movies = Array.isArray(favs.movies) ? favs.movies : [];
            favs.series = Array.isArray(favs.series) ? favs.series : [];
            return favs;
        },

        saveFavorites: function (favs) {
            return write(KEYS.favorites, favs);
        },

        isFavorite: function (type, id) {
            var favs = this.getFavorites();
            var list = favs[type] || [];
            for (var i = 0; i < list.length; i++) {
                if (favKey(list[i]) === String(id)) return true;
            }
            return false;
        },

        toggleFavorite: function (type, item) {
            var favs = this.getFavorites();
            if (!favs[type]) favs[type] = [];
            var list = favs[type];
            var id = favKey(item);
            var index = -1;

            for (var i = 0; i < list.length; i++) {
                if (favKey(list[i]) === id) { index = i; break; }
            }

            if (index > -1) {
                list.splice(index, 1);
                this.saveFavorites(favs);
                return false;
            }

            var entry = {};
            Object.keys(item || {}).forEach(function (key) {
                var value = item[key];
                if (value !== undefined && value !== null && value !== '') entry[key] = value;
            });
            if (!entry.id && entry.stream_id !== undefined) entry.id = entry.stream_id;
            if (!entry.id && entry.series_id !== undefined) entry.id = entry.series_id;
            entry.added_at = nowIso();
            list.unshift(entry);
            this.saveFavorites(favs);
            return true;
        },

        removeFavorite: function (type, id) {
            var favs = this.getFavorites();
            var list = favs[type] || [];
            favs[type] = list.filter(function (item) {
                return favKey(item) !== String(id);
            });
            this.saveFavorites(favs);
        },

        clearFavorites: function () {
            this.saveFavorites(emptyFavorites());
        },

        /* ---------------- Últimos assistidos ---------------- */

        getRecent: function () {
            var list = read(KEYS.recent, []);
            return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
        },

        pushRecent: function (entry) {
            if (!entry || entry.id === undefined || entry.id === null) return this.getRecent();

            var item = {};
            Object.keys(entry).forEach(function (key) {
                var value = entry[key];
                if (value !== undefined && value !== null) item[key] = value;
            });
            item.type = item.type || 'live';
            item.watched_at = nowIso();
            if (!item.title) item.title = item.name || 'Sem título';

            var list = this.getRecent().filter(function (old) {
                return !(old.type === item.type && String(old.id) === String(item.id));
            });
            list.unshift(item);
            list = list.slice(0, MAX_RECENT);
            write(KEYS.recent, list);
            return list;
        },

        clearRecent: function () {
            write(KEYS.recent, []);
        }
    };

    global.Store = Store;

    /* Seed opcional: LOCAL_SEED_ACCOUNT (objeto ou lista) em js/config.local.js.
       Cada conta é cadastrada uma única vez (controlada por id). Contas novas na
       lista entram na próxima abertura; contas excluídas pelo app não voltam. */
    (function seedLocalAccounts() {
        var seed = global.LOCAL_SEED_ACCOUNT;
        if (!seed) return;
        var list = (Array.isArray(seed) ? seed : [seed]).filter(function (item) {
            return item && item.url;
        });
        if (!list.length) return;

        var done = read(KEYS.seeded, []);
        if (!Array.isArray(done)) done = [];
        var accounts = Store.getAccounts();
        var changed = false;

        list.forEach(function (item) {
            var id = String(item.id || '');
            if (!id || done.indexOf(id) !== -1) return;
            done.push(id);
            changed = true;
            if (Store.getAccount(id)) return;
            accounts.push(normalizeAccount(item));
        });

        if (!changed) return;
        Store.saveAccounts(accounts);
        write(KEYS.seeded, done);
        if (!Store.getActiveAccount() && accounts.length) {
            Store.setActiveAccount(accounts[0].id);
        }
    })();

})(window);
