/*
 * views/home.js
 * Menu principal (Live TV, Filmes, Séries, Favoritos, Configurações) e a
 * faixa inferior com os últimos 5 itens assistidos.
 */
(function (global) {
    'use strict';

    var App = global.App;

    var TILES = [
        { action: 'livetv', icon: 'TV', label: 'Live TV', sub: 'Canais ao vivo' },
        { action: 'movies', icon: 'VOD', label: 'Filmes', sub: 'Catálogo de filmes' },
        { action: 'series', icon: 'SER', label: 'Séries', sub: 'Temporadas e episódios' },
        { action: 'favorites', icon: 'FAV', label: 'Favoritos', sub: 'Itens salvos' },
        { action: 'config', icon: 'CFG', label: 'Configurações', sub: 'Listas e contas' }
    ];

    function recentCard(entry, index) {
        var card = App.el('button', 'recent-card focusable', '');
        card.type = 'button';
        card.setAttribute('data-recent', index);

        var image = entry.cover || entry.logo || '';
        var thumb = image
            ? '<img src="' + App.esc(image) + '" alt="">'
            : '<span class="recent-fallback">' + App.esc(App.initials(entry.title)) + '</span>';

        var kinds = { live: 'Ao vivo', movie: 'Filme', series: 'Série' };

        card.innerHTML =
            '<span class="recent-thumb">' + thumb + '</span>' +
            '<span class="recent-info">' +
                '<span class="recent-title">' + App.esc(entry.title || 'Sem título') + '</span>' +
                '<span class="recent-sub">' + App.esc(kinds[entry.type] || 'Item') +
                    (entry.subtitle ? ' · ' + App.esc(entry.subtitle) : '') +
                '</span>' +
            '</span>';
        return card;
    }

    function openRecent(entry) {
        if (!entry) return;

        if (entry.type === 'series' && entry.seriesId) {
            App.navigate('series', { seriesId: entry.seriesId });
            return;
        }

        if (!entry.url) {
            App.toast('Este item não está mais disponível.');
            return;
        }

        App.playStream({
            url: entry.url,
            title: entry.title,
            subtitle: entry.subtitle,
            isLive: entry.type === 'live',
            type: entry.type,
            id: entry.id,
            logo: entry.logo,
            cover: entry.cover
        });
    }

    function updateCounts(section, catalog) {
        var counts = {
            livetv: catalog.live.items.length + ' canais',
            movies: catalog.movies.items.length + ' filmes',
            series: catalog.series.items.length ? catalog.series.items.length + ' séries'
                : 'Indisponível nesta lista'
        };

        Object.keys(counts).forEach(function (action) {
            var node = section.querySelector('[data-sub="' + action + '"]');
            if (node) node.textContent = counts[action];
        });

        var favs = global.Store.getFavorites();
        var favNode = section.querySelector('[data-sub="favorites"]');
        if (favNode) {
            var total = favs.live.length + favs.movies.length + favs.series.length;
            favNode.textContent = total + (total === 1 ? ' item salvo' : ' itens salvos');
        }
    }

    var Home = {
        render: function (section) {
            var account = global.Store.getActiveAccount();
            if (!account) {
                App.replace('login', {});
                return;
            }

            var recent = global.Store.getRecent();

            var tilesMarkup = TILES.map(function (tile) {
                return '<button type="button" class="tile focusable" data-action="' + tile.action + '">' +
                    '<span class="tile-icon">' + tile.icon + '</span>' +
                    '<span class="tile-label">' + tile.label + '</span>' +
                    '<span class="tile-sub" data-sub="' + tile.action + '">' + tile.sub + '</span>' +
                '</button>';
            }).join('');

            section.innerHTML =
                '<div class="home">' +
                    '<header class="home-head">' +
                        '<div class="brand"><span class="brand-mark"></span>IPTV Player</div>' +
                        '<div class="home-meta">' +
                            '<strong>' + App.esc(account.name) + '</strong>' +
                            '<span>' + (account.type === 'm3u' ? 'Lista M3U' : 'Xtream Codes') + '</span>' +
                        '</div>' +
                    '</header>' +
                    '<nav class="home-menu">' + tilesMarkup + '</nav>' +
                    '<section class="recent">' +
                        '<div class="recent-head">' +
                            '<h2 class="screen-title">Últimos assistidos</h2>' +
                            '<span class="pane-count">' + (recent.length ? 'Até 5 itens' : '') + '</span>' +
                        '</div>' +
                        '<div class="recent-row" data-role="recent">' +
                            (recent.length
                                ? ''
                                : '<p class="empty recent-empty">Nada por aqui ainda. Escolha um canal ou filme para começar.</p>') +
                        '</div>' +
                    '</section>' +
                '</div>';

            var row = section.querySelector('[data-role="recent"]');
            if (recent.length) {
                recent.forEach(function (entry, index) {
                    row.appendChild(recentCard(entry, index));
                });
            }

            section.addEventListener('click', function (event) {
                if (App.dialogOpen()) return;

                var target = event.target;
                if (!target || !target.closest) return;

                var tile = target.closest('[data-action]');
                if (tile) {
                    App.navigate(tile.getAttribute('data-action'), {});
                    return;
                }

                var card = target.closest('[data-recent]');
                if (card) {
                    openRecent(recent[Number(card.getAttribute('data-recent'))]);
                }
            });

            App.loadCatalog().then(function (catalog) {
                updateCounts(section, catalog);
            }).catch(function (error) {
                App.toast(error && error.message ? error.message : 'Não foi possível carregar a lista.');
            });
        },

        onKey: function () {
            return false;
        }
    };

    App.registerView('home', Home);

})(window);
