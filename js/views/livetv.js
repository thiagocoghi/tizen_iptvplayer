/*
 * views/livetv.js
 * Live TV: coluna de categorias, lista de canais, mini player (Preview) e
 * painel de EPG do canal selecionado. Enter abre o player em tela cheia;
 * a tecla amarela alterna o favorito.
 */
(function (global) {
    'use strict';

    var App = global.App;

    var state = {
        section: null,
        catalog: null,
        categoryId: 'all',
        channels: [],
        selected: null,
        listings: [],
        epgToken: 0,
        epgTimer: null,
        query: ''
    };

    var searchTimer = null;

    function renderChannelList(section, channels, title, focusFirst) {
        state.channels = channels;
        section.querySelector('[data-role="cat-name"]').textContent = title;
        section.querySelector('[data-role="count"]').textContent =
            channels.length + (channels.length === 1 ? ' canal' : ' canais');

        var container = section.querySelector('[data-role="channels"]');
        container.innerHTML = '';

        if (!channels.length) {
            container.innerHTML = '<p class="empty">Nenhum canal encontrado.</p>';
            return;
        }

        App.renderList(container, channels, channelRow, { chunk: 80 });

        var first = container.querySelector('[data-index]');
        if (focusFirst && first) App.focus(first);
    }

    function clearSearch(section) {
        var input = section.querySelector('[data-role="search"]');
        if (input) input.value = '';
        state.query = '';
    }

    /* Busca em todas as categorias. Não troca o canal do preview: só lista. */
    function runSearch(section) {
        if (!state.query) {
            selectCategory(section, state.categoryId, false);
            return;
        }
        var results = App.search('live', state.query);
        renderChannelList(section, results, 'Busca: ' + state.query, false);
    }

    function buildShell(section) {
        section.innerHTML =
            '<div class="layout layout-live">' +
                '<aside class="pane pane-cats">' +
                    '<h2 class="pane-title">Categorias</h2>' +
                    '<div class="list scroll" data-role="cats"></div>' +
                '</aside>' +
                '<div class="pane pane-items">' +
                    '<div class="search-bar">' +
                        '<input type="search" class="input search-input focusable" data-role="search" ' +
                            'placeholder="Buscar canal por nome (todas as categorias)" autocomplete="off"/>' +
                    '</div>' +
                    '<div class="pane-head">' +
                        '<h2 class="pane-title" data-role="cat-name">Todos os canais</h2>' +
                        '<span class="pane-count" data-role="count"></span>' +
                    '</div>' +
                    '<div class="list scroll" data-role="channels"></div>' +
                '</div>' +
                '<div class="pane pane-preview">' +
                    '<div class="preview-wrap is-idle" data-role="preview">' +
                        '<video playsinline muted></video>' +
                        '<div class="spinner preview-spinner"></div>' +
                        '<span class="preview-badge" data-role="preview-badge"></span>' +
                    '</div>' +
                    '<div class="epg-panel">' +
                        '<h3 class="epg-now-title" data-role="epg-title">Programação</h3>' +
                        '<p class="epg-now-desc" data-role="epg-desc"></p>' +
                        '<div class="epg-progress"><div class="epg-progress-fill" data-role="epg-fill"></div></div>' +
                        '<div class="epg-times">' +
                            '<span data-role="epg-start"></span>' +
                            '<span data-role="epg-end"></span>' +
                        '</div>' +
                        '<ul class="epg-next" data-role="epg-next"></ul>' +
                    '</div>' +
                    '<div class="preview-actions">' +
                        '<button type="button" class="btn btn-primary focusable" data-action="watch">▶ Assistir</button>' +
                        '<button type="button" class="btn focusable" data-role="fav" data-action="fav">☆ Favorito</button>' +
                    '</div>' +
                    '<p class="footer-hint">Amarelo: favoritar · Enter: tela cheia</p>' +
                '</div>' +
            '</div>';
    }

    function channelRow(channel, index) {
        var row = App.el('button', 'list-item list-channel focusable', '');
        row.type = 'button';
        row.setAttribute('data-index', index);

        var logo = channel.logo
            ? '<img class="list-item-icon" src="' + App.esc(channel.logo) + '" alt="">'
            : '<span class="list-item-icon list-item-icon--empty">' + App.esc(App.initials(channel.name)) + '</span>';

        var favorite = global.Store.isFavorite('live', channel.id);

        row.innerHTML = logo +
            '<span class="list-item-body">' +
                '<span class="list-item-title">' + App.esc(channel.name) + '</span>' +
                '<span class="list-item-sub">' +
                    (channel.number ? 'Canal ' + App.esc(channel.number) : 'Ao vivo') +
                '</span>' +
            '</span>' +
            '<span class="list-item-star">' + (favorite ? '★' : '') + '</span>';

        return row;
    }

    function renderCategories(section) {
        var container = section.querySelector('[data-role="cats"]');
        var categories = (state.catalog.live.categories || []);
        container.innerHTML = '';

        categories.forEach(function (category) {
            var button = App.el('button', 'list-item focusable', '');
            button.type = 'button';
            button.setAttribute('data-cat', category.id);
            if (category.id === state.categoryId) button.classList.add('is-active');
            button.innerHTML =
                '<span class="list-item-body">' +
                    '<span class="list-item-title">' + App.esc(category.name) + '</span>' +
                '</span>' +
                '<span class="list-item-badge">' + category.count + '</span>';
            container.appendChild(button);
        });
    }

    function selectCategory(section, categoryId, focusFirstChannel) {
        state.categoryId = categoryId;

        var cats = section.querySelectorAll('[data-cat]');
        for (var i = 0; i < cats.length; i++) {
            cats[i].classList.toggle('is-active', cats[i].getAttribute('data-cat') === categoryId);
        }

        var category = state.catalog.live.categories.filter(function (item) {
            return String(item.id) === String(categoryId);
        })[0];

        section.querySelector('[data-role="cat-name"]').textContent =
            category ? category.name : 'Todos os canais';

        state.channels = App.items('live', categoryId);
        section.querySelector('[data-role="count"]').textContent =
            state.channels.length + (state.channels.length === 1 ? ' canal' : ' canais');

        var container = section.querySelector('[data-role="channels"]');
        container.innerHTML = '';

        if (!state.channels.length) {
            container.innerHTML = '<p class="empty">Nenhum canal nesta categoria.</p>';
            state.selected = null;
            return;
        }

        App.renderList(container, state.channels, channelRow, { chunk: 80 });

        var first = container.querySelector('[data-index]');
        if (focusFirstChannel && first) App.focus(first);

        selectChannel(state.channels[0]);
    }

    function updateFavoriteButton() {
        var button = state.section ? state.section.querySelector('[data-role="fav"]') : null;
        if (!button) return;

        if (!state.selected) {
            button.textContent = '☆ Favorito';
            button.classList.remove('is-fav');
            return;
        }

        var favorite = global.Store.isFavorite('live', state.selected.id);
        button.textContent = favorite ? '★ Favorito' : '☆ Favorito';
        button.classList.toggle('is-fav', favorite);
    }

    function selectChannel(channel) {
        if (!channel || !state.section) return;

        state.selected = channel;
        global.Preview.play(channel.url);

        var badge = state.section.querySelector('[data-role="preview-badge"]');
        if (badge) badge.textContent = channel.name;

        updateFavoriteButton();
        loadEpg(channel);
    }

    function playSelected() {
        if (!state.selected) return;
        App.playLive(state.selected);
    }

    function toggleFavorite() {
        if (!state.selected) return;

        App.toggleFavorite('live', {
            id: state.selected.id,
            name: state.selected.name,
            logo: state.selected.logo,
            url: state.selected.url,
            epgChannelId: state.selected.epgChannelId,
            categoryId: state.selected.categoryId,
            number: state.selected.number
        });

        var row = state.section.querySelector('[data-index].is-current');
        if (row) {
            var star = row.querySelector('.list-item-star');
            if (star) star.textContent = global.Store.isFavorite('live', state.selected.id) ? '★' : '';
        }
        updateFavoriteButton();
    }

    function setEpgText(title, description) {
        var section = state.section;
        if (!section) return;

        section.querySelector('[data-role="epg-title"]').textContent = title || 'Programação';
        section.querySelector('[data-role="epg-desc"]').textContent = description || '';

        if (!description) {
            section.querySelector('[data-role="epg-fill"]').style.width = '0%';
            section.querySelector('[data-role="epg-start"]').textContent = '';
            section.querySelector('[data-role="epg-end"]').textContent = '';
        }
    }

    function clearNext() {
        var list = state.section ? state.section.querySelector('[data-role="epg-next"]') : null;
        if (list) list.innerHTML = '';
    }

    function renderEpg(listings) {
        var section = state.section;
        if (!section) return;

        state.listings = listings || [];

        if (!state.listings.length) {
            setEpgText('Programação', 'Sem dados de EPG para este canal.');
            clearNext();
            return;
        }

        var current = global.EPG.current(state.listings);
        var program = current.program;

        if (!program) {
            setEpgText('Programação', 'Sem programação no momento.');
            clearNext();
            return;
        }

        setEpgText(program.title, program.description || 'Sem descrição.');
        section.querySelector('[data-role="epg-start"]').textContent = App.clock(program.start);
        section.querySelector('[data-role="epg-end"]').textContent = App.clock(program.end);
        section.querySelector('[data-role="epg-fill"]').style.width =
            Math.round(current.progress * 100) + '%';

        var next = section.querySelector('[data-role="epg-next"]');
        next.innerHTML = '';

        var now = Date.now();
        state.listings.filter(function (item) {
            return item.end.getTime() > now && item !== program;
        }).slice(0, 4).forEach(function (item) {
            var li = document.createElement('li');
            li.className = 'epg-next-item';
            li.innerHTML =
                '<span class="epg-next-time">' + App.clock(item.start) + '</span>' +
                '<span class="epg-next-title">' + App.esc(item.title) + '</span>';
            next.appendChild(li);
        });
    }

    function loadEpg(channel) {
        var token = ++state.epgToken;
        var account = global.Store.getActiveAccount();
        var epgUrl = (state.catalog && state.catalog.epgUrl) ||
            (account && account.epg_url) || '';

        setEpgText('Programação', 'Buscando informações do EPG...');
        clearNext();

        global.EPG.forChannel(account, channel, { epgUrl: epgUrl, limit: 8 }).then(function (listings) {
            if (token !== state.epgToken) return;
            renderEpg(listings);
        }).catch(function () {
            if (token !== state.epgToken) return;
            setEpgText('Programação', 'EPG indisponível para este canal.');
            clearNext();
        });
    }

    function highlightCurrent(container, index) {
        var rows = container.querySelectorAll('[data-index]');
        for (var i = 0; i < rows.length; i++) {
            rows[i].classList.toggle('is-current', Number(rows[i].getAttribute('data-index')) === index);
        }
    }

    function bindEvents(section) {
        section.addEventListener('click', function (event) {
            if (App.dialogOpen()) return;

            var target = event.target;
            if (!target || !target.closest) return;

            if (target.closest('[data-action="watch"]')) {
                playSelected();
                return;
            }
            if (target.closest('[data-action="fav"]')) {
                toggleFavorite();
                return;
            }

            var categoryBtn = target.closest('[data-cat]');
            if (categoryBtn) {
                clearSearch(section);
                selectCategory(section, categoryBtn.getAttribute('data-cat'), true);
                return;
            }

            var channelBtn = target.closest('[data-index]');
            if (channelBtn) {
                var index = Number(channelBtn.getAttribute('data-index'));
                var channel = state.channels[index];
                if (channel) {
                    selectChannel(channel);
                    highlightCurrent(section.querySelector('[data-role="channels"]'), index);
                    App.playLive(channel);
                }
            }
        });

        section.addEventListener('input', function (event) {
            var input = event.target;
            if (!input || input.getAttribute('data-role') !== 'search') return;

            state.query = input.value.trim();
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () { runSearch(section); }, 250);
        });

        section.addEventListener('focusin', function (event) {
            var row = event.target && event.target.closest ? event.target.closest('[data-index]') : null;
            if (!row) return;

            var index = Number(row.getAttribute('data-index'));
            var channel = state.channels[index];
            if (!channel) return;

            highlightCurrent(section.querySelector('[data-role="channels"]'), index);

            if (!state.selected || String(state.selected.id) !== String(channel.id)) {
                selectChannel(channel);
            }
        });
    }

    var LiveTv = {
        render: function (section) {
            state.section = section;
            state.catalog = null;
            state.selected = null;
            state.listings = [];
            state.query = '';

            buildShell(section);
            bindEvents(section);
            global.Preview.bind(section.querySelector('[data-role="preview"]'));

            App.loader(true, 'Carregando canais...');

            App.loadCatalog().then(function (catalog) {
                App.loader(false);
                state.catalog = catalog;

                if (!catalog.live.items.length) {
                    section.querySelector('[data-role="channels"]').innerHTML =
                        '<p class="empty">Esta lista não possui canais ao vivo.</p>';
                    section.querySelector('[data-role="cats"]').innerHTML = '';
                    return;
                }

                renderCategories(section);
                selectCategory(section, 'all', true);
            }).catch(function (error) {
                App.loader(false);
                section.querySelector('[data-role="channels"]').innerHTML =
                    '<p class="empty">' + App.esc(error && error.message || 'Falha ao carregar os canais.') + '</p>';
                App.toast(error && error.message || 'Falha ao carregar os canais.');
            });

            if (state.epgTimer) clearInterval(state.epgTimer);
            state.epgTimer = setInterval(function () {
                if (state.listings.length) renderEpg(state.listings);
            }, 60000);
        },

        onKey: function (code) {
            if (code === App.KEY.YELLOW) {
                toggleFavorite();
                return true;
            }
            if (code === App.KEY.INFO) {
                playSelected();
                return true;
            }
            return false;
        },

        destroy: function () {
            if (state.epgTimer) {
                clearInterval(state.epgTimer);
                state.epgTimer = null;
            }
            state.epgToken++;
            global.Preview.stop();
            state.section = null;
            state.selected = null;
            state.listings = [];
        }
    };

    App.registerView('livetv', LiveTv);

})(window);
