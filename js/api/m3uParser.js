/*
 * api/m3uParser.js
 * Parser de listas M3U/M3U8 (#EXTINF).
 * Suporta canais ao vivo e filmes (VOD) + extração da URL do EPG (url-tvg).
 */
(function (global) {
    'use strict';

    var TIMEOUT = 30000;

    function parseAttributes(text) {
        var attrs = {};
        var re = /([A-Za-z0-9_-]+)="([^"]*)"/g;
        var match;
        while ((match = re.exec(text)) !== null) {
            attrs[match[1].toLowerCase()] = match[2];
        }
        return attrs;
    }

    function extensionOf(url) {
        var match = /\.([A-Za-z0-9]{2,5})(?:[?#]|$)/.exec(String(url || ''));
        return match ? match[1].toLowerCase() : '';
    }

    function yearOf(name) {
        var match = /\((19\d{2}|20\d{2})\)/.exec(name) || /\b(19\d{2}|20\d{2})\s*$/.exec(name);
        return match ? match[1] : '';
    }

    function detectType(name, group, url) {
        var ext = extensionOf(url);
        var groupLower = String(group || '').toLowerCase();
        var nameLower = String(name || '').toLowerCase();

        if (/(filme|filmes|movie|movies|vod|cinema)/.test(groupLower)) return 'movie';
        if (['mp4', 'mkv', 'avi', 'mov', 'm4v', 'webm'].indexOf(ext) > -1) return 'movie';
        if (/(^|\/)(movie|vod)\//.test(nameLower)) return 'movie';
        return 'live';
    }

    function isSeriesEpisode(name) {
        return /\bS\d{1,2}\s*E\d{1,3}\b/i.test(name) || /\b\d{1,2}x\d{1,3}\b/.test(name);
    }

    function buildCategory(title, state) {
        var name = String(title || '').trim() || 'Sem categoria';
        if (state.categories[name]) return state.categories[name];
        var category = { id: name, name: name, count: 0 };
        state.categories[name] = category;
        state.list.push(category);
        return category;
    }

    function parse(text) {
        var lines = String(text || '').split(/\r?\n/);
        var state = {
            categories: {},
            list: [],
            live: { categories: [], items: [] },
            movies: { categories: [], items: [] },
            skipped: 0,
            epgUrl: ''
        };

        var pending = null;
        var pendingGroup = '';
        var total = 0;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            if (line.indexOf('#EXTM3U') === 0) {
                var header = parseAttributes(line);
                state.epgUrl = header['url-tvg'] || header['x-tvg-url'] || header['tvg-url'] || '';
                continue;
            }

            if (line.indexOf('#EXTINF:') === 0) {
                var commaIndex = line.indexOf(',');
                var meta = commaIndex > -1 ? line.slice(0, commaIndex) : line;
                var title = commaIndex > -1 ? line.slice(commaIndex + 1).trim() : '';
                var attrs = parseAttributes(meta);
                pending = {
                    name: title || attrs['tvg-name'] || 'Sem nome',
                    logo: attrs['tvg-logo'] || '',
                    group: pendingGroup || attrs['group-title'] || 'Sem categoria',
                    tvgId: attrs['tvg-id'] || '',
                    tvgName: attrs['tvg-name'] || ''
                };
                pendingGroup = '';
                continue;
            }

            if (line.indexOf('#EXTGRP:') === 0) {
                pendingGroup = line.slice('#EXTGRP:'.length).trim();
                continue;
            }

            if (line.charAt(0) === '#') continue;

            if (!pending) continue;

            var url = line;
            if (!/^(https?|rtmp|rtsp|udp|rtp):\/\//i.test(url)) {
                pending = null;
                continue;
            }

            total++;
            var type = detectType(pending.name, pending.group, url);

            if (type === 'movie') {
                var movieCategory = buildCategory(pending.group, state);
                state.movies.items.push({
                    id: 'm3u-v-' + state.movies.items.length,
                    name: pending.name,
                    poster: pending.logo,
                    categoryId: movieCategory.id,
                    url: url,
                    ext: extensionOf(url) || 'mp4',
                    year: yearOf(pending.name),
                    rating: '',
                    plot: ''
                });
                movieCategory.count++;
            } else if (isSeriesEpisode(pending.name)) {
                // Séries em M3U não são agrupadas nesta versão (use Xtream para séries).
                state.skipped++;
            } else {
                var liveCategory = buildCategory(pending.group, state);
                state.live.items.push({
                    id: 'm3u-l-' + state.live.items.length,
                    name: pending.name,
                    logo: pending.logo,
                    categoryId: liveCategory.id,
                    url: url,
                    epgChannelId: pending.tvgId,
                    number: state.live.items.length + 1
                });
                liveCategory.count++;
            }

            pending = null;
        }

        state.live.categories = state.list.filter(function (category) {
            return category.count > 0;
        }).sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
        state.movies.categories = state.list.filter(function (category) {
            return category.count > 0;
        }).sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });

        // Reaproveita o mesmo array de categorias apenas para as que possuem itens do tipo.
        state.live.categories = categoriesWithItems(state.live.categories, state.live.items);
        state.movies.categories = categoriesWithItems(state.movies.categories, state.movies.items);

        return {
            live: state.live,
            movies: state.movies,
            epgUrl: state.epgUrl,
            total: total,
            skipped: state.skipped
        };
    }

    function categoriesWithItems(categories, items) {
        var used = {};
        items.forEach(function (item) {
            used[item.categoryId] = true;
        });
        return categories.filter(function (category) {
            return used[category.id];
        });
    }

    function requestText(url, timeoutMs) {
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
                throw new Error('Não foi possível baixar a lista (HTTP ' + response.status + ').');
            }
            return response.text();
        });

        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () {
                if (controller) controller.abort();
                reject(new Error('Tempo esgotado ao baixar a lista M3U.'));
            }, timeoutMs || TIMEOUT);

            request.then(function (text) {
                clearTimeout(timer);
                resolve(text);
            }, function (error) {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    var M3UParser = {
        parse: parse,
        load: function (url) {
            return requestText(url).then(function (text) {
                var result = parse(text);
                if (!result.total) {
                    throw new Error('Nenhum canal encontrado nesta lista M3U.');
                }
                return result;
            });
        }
    };

    global.M3UParser = M3UParser;

})(window);
