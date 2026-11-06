/*
 * api/xtream.js
 * Cliente da API Xtream Codes (player_api.php).
 * Responsável por autenticação, catálogos, informações de VOD/séries,
 * EPG resumido e montagem das URLs de stream.
 */
(function (global) {
    'use strict';

    var DEFAULT_TIMEOUT = 20000;

    function withTimeout(promise, ms, message) {
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () {
                reject(new Error(message || 'Tempo esgotado ao conectar no servidor.'));
            }, ms);

            promise.then(function (value) {
                clearTimeout(timer);
                resolve(value);
            }, function (error) {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    function requestJson(url, timeoutMs) {
        if (typeof global.fetch !== 'function') {
            return Promise.reject(new Error('Este dispositivo não suporta requisições de rede (fetch).'));
        }

        var options = { cache: 'no-store' };
        var controller = null;

        if (typeof global.AbortController === 'function') {
            controller = new global.AbortController();
            options.signal = controller.signal;
        }

        var request = global.fetch(url, options).then(function (response) {
            if (!response.ok) {
                throw new Error('O servidor respondeu HTTP ' + response.status + '.');
            }
            return response.text();
        }).then(function (text) {
            if (!text) return null;
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('O servidor não retornou um JSON válido.');
            }
        });

        return withTimeout(request, timeoutMs || DEFAULT_TIMEOUT).catch(function (error) {
            if (controller && error && error.name === 'AbortError') {
                throw new Error('Tempo esgotado ao conectar no servidor.');
            }
            throw error;
        });
    }

    function normalizeBase(url) {
        return String(url || '').trim().replace(/\/+$/, '');
    }

    function Xtream(account) {
        account = account || {};
        this.base = normalizeBase(account.url);
        this.username = String(account.username || '');
        this.password = String(account.password || '');
    }

    Xtream.prototype.credentialsQuery = function () {
        return 'username=' + encodeURIComponent(this.username) +
            '&password=' + encodeURIComponent(this.password);
    };

    Xtream.prototype.api = function (params) {
        var query = this.credentialsQuery();
        if (params) {
            Object.keys(params).forEach(function (key) {
                var value = params[key];
                if (value === undefined || value === null || value === '') return;
                query += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(value);
            });
        }
        return requestJson(this.base + '/player_api.php?' + query);
    };

    /* ---------------- Autenticação ---------------- */

    Xtream.prototype.auth = function () {
        var self = this;
        return this.api({}).then(function (data) {
            var info = (data && data.user_info) || {};
            var authenticated = String(info.auth) === '1' || info.auth === true;
            if (!authenticated) {
                throw new Error('Usuário ou senha inválidos para este servidor.');
            }
            return data;
        }).catch(function (error) {
            if (error && /HTTP 40[13]/.test(error.message)) {
                throw new Error('Acesso negado pelo servidor. Confira servidor, usuário e senha.');
            }
            throw error;
        });
    };

    /* ---------------- Catálogos ---------------- */

    Xtream.prototype.getLiveCategories = function () {
        return this.api({ action: 'get_live_categories' }).then(asArray);
    };

    Xtream.prototype.getLiveStreams = function () {
        return this.api({ action: 'get_live_streams' }).then(asArray);
    };

    Xtream.prototype.getVodCategories = function () {
        return this.api({ action: 'get_vod_categories' }).then(asArray);
    };

    Xtream.prototype.getVodStreams = function () {
        return this.api({ action: 'get_vod_streams' }).then(asArray);
    };

    Xtream.prototype.getSeriesCategories = function () {
        return this.api({ action: 'get_series_categories' }).then(asArray);
    };

    Xtream.prototype.getSeries = function () {
        return this.api({ action: 'get_series' }).then(asArray);
    };

    Xtream.prototype.getVodInfo = function (vodId) {
        return this.api({ action: 'get_vod_info', vod_id: vodId }).then(function (data) {
            return data || {};
        });
    };

    Xtream.prototype.getSeriesInfo = function (seriesId) {
        return this.api({ action: 'get_series_info', series_id: seriesId }).then(function (data) {
            return data || {};
        });
    };

    Xtream.prototype.getShortEpg = function (streamId, limit) {
        return this.api({
            action: 'get_short_epg',
            stream_id: streamId,
            limit: limit || 10
        }).then(function (data) {
            var listings = (data && data.epg_listings) || [];
            return Array.isArray(listings) ? listings : [];
        });
    };

    /* ---------------- URLs de stream ---------------- */

    Xtream.prototype.liveUrl = function (streamId, format) {
        var ext = format === 'ts' ? 'ts' : 'm3u8';
        return this.base + '/live/' + encodeURIComponent(this.username) + '/' +
            encodeURIComponent(this.password) + '/' + streamId + '.' + ext;
    };

    Xtream.prototype.vodUrl = function (streamId, extension) {
        return this.base + '/movie/' + encodeURIComponent(this.username) + '/' +
            encodeURIComponent(this.password) + '/' + streamId + '.' + (extension || 'mp4');
    };

    Xtream.prototype.seriesUrl = function (episodeId, extension) {
        return this.base + '/series/' + encodeURIComponent(this.username) + '/' +
            encodeURIComponent(this.password) + '/' + episodeId + '.' + (extension || 'mp4');
    };

    Xtream.prototype.streamUrl = function (kind, id, extension) {
        if (kind === 'movie') return this.vodUrl(id, extension);
        if (kind === 'series') return this.seriesUrl(id, extension);
        return this.liveUrl(id);
    };

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    global.Xtream = Xtream;

})(window);
