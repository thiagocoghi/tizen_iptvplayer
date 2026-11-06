/*
 * views/favorites.js
 * Favoritos divididos por categoria (TV, Filmes, Séries) com remoção rápida
 * pela tecla azul e abertura direta do item salvo.
 */
(function (global) {
    'use strict';

    var App = global.App;

    var TABS = [
        { id: 'live', label: 'TV ao vivo' },
        { id: 'movies', label: 'Filmes' },
        { id: 'series', label: 'Séries' }
    ];

    var state = {
        section: null,
        tab: 'live'
    };

    function itemsOf(tab) {
        var favorites = global.Store.getFavorites();
        return favorites[tab] || [];
    }

    function resolveItem(tab, item) {
        var catalog = App.catalog;
        if (!catalog || !catalog[tab]) return item;

        var list = catalog[tab].items || [];
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(item.id)) return list[i];
        }
        return item;
    }

    function renderTabs() {
        var container = state.section.querySelector('[data-role="tabs"]');
        container.innerHTML = '';

        TABS.forEach(function (tab) {
            var button = App.el('button', 'tab focusable' + (tab.id === state.tab ? ' is-active' : ''), tab.label);
            button.type = 'button';
            button.setAttribute('data-tab', tab.id);
            container.appendChild(button);
        });
    }

    function favoriteRow(item, index) {
        var isLive = state.tab === 'live';
        var image = isLive ? item.logo : (item.poster || item.cover);
        var thumb = image
            ? '<img class="list-item-icon" src="' + App.esc(image) + '" alt="">'
            : '<span class="list-item-icon list-item-icon--empty">' + App.esc(App.initials(item.name)) + '</span>';

        var sub = isLive
            ? 'Canal ao vivo'
            : (state.tab === 'series'
                ? 'Série · Enter para ver os episódios'
                : 'Filme' + (item.year ? ' · ' + item.year : ''));

        var row = App.el('button', 'list-item focusable', '');
        row.type = 'button';
        row.setAttribute('data-index', index);
        row.innerHTML = thumb +
            '<span class="list-item-body">' +
                '<span class="list-item-title">' + App.esc(item.name || 'Sem título') + '</span>' +
                '<span class="list-item-sub">' + App.esc(sub) + '</span>' +
            '</span>' +
            '<span class="list-item-star">★</span>';
        return row;
    }

    function renderList() {
        var container = state.section.querySelector('[data-role="list"]');
        var items = itemsOf(state.tab);
        container.innerHTML = '';

        if (!items.length) {
            container.innerHTML = '<p class="empty">Nenhum favorito em ' +
                App.esc((TABS.filter(function (t) { return t.id === state.tab; })[0] || {}).label) +
                ' ainda.<br>Use a tecla amarela nas telas de canais, filmes ou séries.</p>';
            return;
        }

        items.forEach(function (item, index) {
            container.appendChild(favoriteRow(item, index));
        });

        var first = container.querySelector('[data-index]');
        if (first) App.focus(first);
    }

    function switchTab(tabId) {
        if (!tabId || tabId === state.tab) return;
        state.tab = tabId;
        renderTabs();
        renderList();

        var active = state.section.querySelector('[data-tab="' + tabId + '"]');
        if (active) App.focus(active);
    }

    function openItem(item) {
        if (!item) return;

        if (state.tab === 'series') {
            App.navigate('series', { seriesId: item.id });
            return;
        }

        var resolved = resolveItem(state.tab, item);

        if (!resolved || !resolved.url) {
            App.toast('Este favorito ainda não tem endereço de vídeo. Abra a lista para atualizar.');
            return;
        }

        if (state.tab === 'live') App.playLive(resolved);
        else App.playMovie(resolved);
    }

    function removeSelected() {
        var list = state.section.querySelector('[data-role="list"]');
        var focusRow = document.activeElement;
        if (!focusRow || !focusRow.getAttribute) return;

        var index = Number(focusRow.getAttribute('data-index'));
        var items = itemsOf(state.tab);
        var item = items[index];
        if (!item) return;

        global.Store.removeFavorite(state.tab, item.id);
        App.toast('Removido dos favoritos');
        renderList();
    }

    function bindEvents(section) {
        section.addEventListener('click', function (event) {
            if (App.dialogOpen()) return;

            var target = event.target;
            if (!target || !target.closest) return;

            var tabBtn = target.closest('[data-tab]');
            if (tabBtn) {
                switchTab(tabBtn.getAttribute('data-tab'));
                return;
            }

            var row = target.closest('[data-index]');
            if (row) {
                openItem(itemsOf(state.tab)[Number(row.getAttribute('data-index'))]);
            }
        });
    }

    var Favorites = {
        render: function (section, payload) {
            state.section = section;
            state.tab = (payload && payload.tab) || 'live';

            section.innerHTML =
                '<div class="favs">' +
                    '<div class="favs-head">' +
                        '<h1 class="screen-title">Favoritos</h1>' +
                        '<div class="tabs" data-role="tabs"></div>' +
                    '</div>' +
                    '<div class="list scroll favs-list" data-role="list"></div>' +
                    '<p class="footer-hint">Azul: remover dos favoritos · Vermelho/Verde/Amarelo: trocar aba · Enter: abrir</p>' +
                '</div>';

            renderTabs();
            renderList();
            bindEvents(section);

            App.loadCatalog().catch(function () { /* favoritos salvos continuam válidos */ });
        },

        onKey: function (code) {
            if (code === App.KEY.BLUE) {
                removeSelected();
                return true;
            }
            if (code === App.KEY.RED) {
                switchTab('live');
                return true;
            }
            if (code === App.KEY.GREEN) {
                switchTab('movies');
                return true;
            }
            if (code === App.KEY.YELLOW) {
                switchTab('series');
                return true;
            }
            return false;
        },

        destroy: function () {
            state.section = null;
        }
    };

    App.registerView('favorites', Favorites);

})(window);
