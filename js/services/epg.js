/*
 * services/epg.js
 * EPG do canal: short EPG da API Xtream e XMLTV (url-tvg do M3U).
 */
(function (global) {
    'use strict';

    var xmltvCache = {};
    var XMLTV_TTL = 6 * 60 * 60 * 1000;

    function decodeBase64(value) {
        if (!value) return '';
        try {
            var binary = global.atob(value);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new global.TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            return String(value);
        }
    }

    function toDate(timestamp, fallback) {
        var seconds = parseInt(timestamp, 10);
        if (!isNaN(seconds) && seconds > 0) return new Date(seconds * 1000);
        if (fallback) {
            var parsed = new Date(String(fallback).replace(' ', 'T'));
            if (!isNaN(parsed.getTime())) return parsed;
        }
        return null;
    }

    function normalizeXtreamListing(listing) {
        return {
            title: decodeBase64(listing.title) || 'Sem título',
            description: decodeBase64(listing.description) || '',
            start: toDate(listing.start_timestamp, listing.start),
            end: toDate(listing.stop_timestamp, listing.end)
        };
    }

    function normalizeListings(list, limit) {
        var now = Date.now();
        return (list || []).filter(function (program) {
            return program.start && program.end && program.end.getTime() > now - 3 * 60 * 60 * 1000;
        }).sort(function (a, b) {
            return a.start - b.start;
        }).slice(0, limit || 8);
    }

    /* ---------------- XMLTV ---------------- */

    function parseXmltvTime(value) {
        var match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(String(value || '').trim());
        if (!match) return null;

        var utc = Date.UTC(
            parseInt(match[1], 10),
            parseInt(match[2], 10) - 1,
            parseInt(match[3], 10),
            parseInt(match[4], 10),
            parseInt(match[5], 10),
            match[6] ? parseInt(match[6], 10) : 0
        );

        var offset = match[7];
        if (offset) {
            var sign = offset.charAt(0) === '-' ? -1 : 1;
            var hours = parseInt(offset.slice(1, 3), 10);
            var minutes = parseInt(offset.slice(3, 5), 10);
            utc -= sign * (hours * 60 + minutes) * 60000;
        }
        return new Date(utc);
    }

    function parseXmltv(text) {
        var parser = new global.DOMParser();
        var doc = parser.parseFromString(text, 'text/xml');

        if (doc.getElementsByTagName('parsererror').length) {
            throw new Error('O EPG XMLTV não pôde ser lido.');
        }

        var byChannel = {};
        var byName = {};
        var displayNames = doc.getElementsByTagName('display-name');
        var channelNodes = doc.getElementsByTagName('channel');

        for (var c = 0; c < channelNodes.length; c++) {
            var channelId = channelNodes[c].getAttribute('id') || '';
            var names = channelNodes[c].getElementsByTagName('display-name');
            for (var n = 0; n < names.length; n++) {
                var label = (names[n].textContent || '').trim().toLowerCase();
                if (label) byName[label] = channelId;
            }
        }
        if (displayNames.length && !channelNodes.length) {
            // XMLTV sem bloco <channel>: nada a indexar por nome.
        }

        var programmes = doc.getElementsByTagName('programme');
        for (var i = 0; i < programmes.length; i++) {
            var node = programmes[i];
            var channel = node.getAttribute('channel') || '';
            if (!channel) continue;

            var titleNode = node.getElementsByTagName('title')[0];
            var descNode = node.getElementsByTagName('desc')[0];
            var start = parseXmltvTime(node.getAttribute('start'));
            var end = parseXmltvTime(node.getAttribute('stop'));
            if (!start || !end) continue;

            if (!byChannel[channel]) byChannel[channel] = [];
            byChannel[channel].push({
                title: titleNode ? (titleNode.textContent || '').trim() : 'Sem título',
                description: descNode ? (descNode.textContent || '').trim() : '',
                start: start,
                end: end
            });
        }

        return { byChannel: byChannel, byName: byName };
    }

    function fetchXmltv(url) {
        var cached = xmltvCache[url];
        if (cached && (Date.now() - cached.loadedAt) < XMLTV_TTL) {
            return Promise.resolve(cached.data);
        }

        if (typeof global.fetch !== 'function') {
            return Promise.reject(new Error('Este dispositivo não suporta requisições de rede (fetch).'));
        }

        return global.fetch(url, { cache: 'no-store' }).then(function (response) {
            if (!response.ok) throw new Error('EPG respondeu HTTP ' + response.status + ' (última chamada: ' + response.url + ').');
            return response.text();
        }).then(function (text) {
            var data = parseXmltv(text);
            xmltvCache[url] = { data: data, loadedAt: Date.now() };
            return data;
        });
    }

    function listingsForXmltv(data, channel) {
        var keys = [];
        if (channel.epgChannelId) keys.push(channel.epgChannelId);
        if (channel.name) keys.push(channel.name.toLowerCase());

        var listings = [];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (data.byChannel[key]) {
                listings = data.byChannel[key];
                break;
            }
            var mappedId = data.byName[key.toLowerCase()];
            if (mappedId && data.byChannel[mappedId]) {
                listings = data.byChannel[mappedId];
                break;
            }
        }
        return listings;
    }

    var EPG = {
        /** Devolve até `limit` programas (atual + seguintes) do canal. */
        forChannel: function (account, channel, options) {
            options = options || {};
            var limit = options.limit || 8;

            if (!account || !channel) return Promise.resolve([]);

            if (account.type === 'm3u') {
                var epgUrl = options.epgUrl || account.epg_url || '';
                if (!epgUrl) return Promise.resolve([]);
                return fetchXmltv(epgUrl).then(function (data) {
                    return normalizeListings(listingsForXmltv(data, channel), limit);
                });
            }

            var api = new global.Xtream(account);
            return api.getShortEpg(channel.id, limit).then(function (listings) {
                return normalizeListings(listings.map(normalizeXtreamListing), limit);
            });
        },

        parseXmltv: parseXmltv,
        fetchXmltv: fetchXmltv,

        /** Programa no ar agora (ou o próximo) e progresso 0..1. */
        current: function (listings) {
            var now = Date.now();
            for (var i = 0; i < listings.length; i++) {
                var program = listings[i];
                if (program.start.getTime() <= now && program.end.getTime() > now) {
                    var progress = (now - program.start.getTime()) /
                        Math.max(1, program.end.getTime() - program.start.getTime());
                    return { program: program, progress: Math.min(1, Math.max(0, progress)) };
                }
            }
            return { program: listings.length ? listings[0] : null, progress: 0 };
        }
    };

    global.EPG = EPG;

})(window);
