/*
 * views/movies.js
 * Filmes (VOD): categorias, grid de capas e painel de detalhes com sinopse,
 * botão Assistir e favorito.
 */
(function (global) {
    'use strict';

    var App = global.App;

    var state = {
        section: null,
        catalog: null,
        categoryId: 'all',
        items: [],
        selected: null,
        infoToken: 0,
        query: ''
    };

    var searchTimer = null;

    function renderGrid(section, items, title, focusFirst) {
        state.items = items;
        section.querySelector('[data-role="cat-name"]').textContent = title;
        section.querySelector('[data-role="count"]').textContent =
            items.length + (items.length === 1 ? ' filme' : ' filmes');

        var grid = section.querySelector('[data-role="grid"]');
        var detail = section.querySelector('[data-role="detail"]');
        grid.innerHTML = '';
        detail.innerHTML = '';
        state.selected = null;

        if (!items.length) {
            grid.innerHTML = '<p class="empty">Nenhum filme encontrado.</p>';
            return;
        }

        App.renderList(grid, items, movieCard, { chunk: 60 });

        if (focusFirst) {
            var first = grid.querySelector('[data-index]');
            if (first) App.focus(first);
        }

        select(items[0]);
    }

    function clearSearch(section) {
        var input = section.querySelector('[data-role="search"]');
        if (input) input.value = '';
        state.query = '';
    }

    /* Busca em todas as categorias. */
    function runSearch(section) {
        if (!state.query) {
            selectCategory(section, state.categoryId, false);
            return;
        }
        renderGrid(section, App.search('movies', state.query), 'Busca: ' + state.query, false);
    }

    function buildShell(section) {
        section.innerHTML =
            '<div class="layout layout-detail">' +
                '<aside class="pane pane-cats">' +
                    '<h2 class="pane-title">Categorias</h2>' +
                    '<div class="list scroll" data-role="cats"></div>' +
                '</aside>' +
                '<div class="pane pane-grid">' +
                    '<div class="search-bar">' +
                        '<input type="search" class="input search-input focusable" data-role="search" ' +
                            'placeholder="Buscar filme por nome (todas as categorias)" autocomplete="off"/>' +
                    '</div>' +
                    '<div class="pane-head">' +
                        '<h2 class="pane-title" data-role="cat-name">Filmes</h2>' +
                        '<span class="pane-count" data-role="count"></span>' +
                    '</div>' +
                    '<div class="grid scroll" data-role="grid"></div>' +
                '</div>' +
                '<div class="pane pane-detail" data-role="detail"></div>' +
            '</div>';
    }

    function posterMarkup(poster, name, className) {
        if (poster) {
            return '<img class="' + (className || 'poster-img') + '" src="' + App.esc(poster) + '" alt="">';
        }
        return '<span class="' + (className === 'detail-img' ? 'detail-fallback' : 'poster-fallback') + '">' +
            App.esc(App.initials(name)) + '</span>';
    }

    function movieCard(movie, index) {
        var card = App.el('button', 'poster-card focusable', '');
        card.type = 'button';
        card.setAttribute('data-index', index);
        card.innerHTML = posterMarkup(movie.poster, movie.name) +
            '<span class="poster-caption">' +
                '<span class="poster-title">' + App.esc(movie.name) + '</span>' +
                '<span class="poster-meta">' +
                    App.esc([movie.year, movie.rating].filter(Boolean).join(' · ')) +
                '</span>' +
            '</span>';
        return card;
    }

    function metaLine(movie, info) {
        info = info || {};
        var parts = [];
        if (movie.year || info.year) parts.push(movie.year || info.year);
        if (info.genre) parts.push(info.genre);
        if (info.duration) parts.push(info.duration);
        if (movie.rating) parts.push('★ ' + movie.rating);
        return parts.join(' · ');
    }

    function renderDetail(movie) {
        var detail = state.section.querySelector('[data-role="detail"]');
        var favorite = global.Store.isFavorite('movies', movie.id);

        detail.innerHTML =
            '<div class="detail">' +
                '<div class="detail-head">' +
                    '<div class="detail-poster">' + posterMarkup(movie.poster, movie.name, 'detail-img') + '</div>' +
                    '<div class="detail-info">' +
                        '<h2 class="detail-title">' + App.esc(movie.name) + '</h2>' +
                        '<p class="detail-meta" data-role="meta">' + App.esc(metaLine(movie)) + '</p>' +
                        '<p class="plot" data-role="plot">' + App.esc(movie.plot || 'Carregando sinopse...') + '</p>' +
                    '</div>' +
                '</div>' +
                '<div class="detail-actions">' +
                    '<button type="button" class="btn btn-primary focusable" data-action="watch">▶ Assistir</button>' +
                    '<button type="button" class="btn focusable' + (favorite ? ' is-fav' : '') +
                        '" data-action="fav">' + (favorite ? '★ Favorito' : '☆ Favorito') + '</button>' +
                '</div>' +
            '</div>';

        var token = ++state.infoToken;
        App.getMovieInfo(movie).then(function (info) {
            if (token !== state.infoToken || !state.section) return;

            var plot = detail.querySelector('[data-role="plot"]');
            var meta = detail.querySelector('[data-role="meta"]');
            if (plot) plot.textContent = info.plot || movie.plot || 'Sem sinopse disponível.';
            if (meta && info.plot !== undefined) meta.textContent = metaLine(movie, info);
        });
    }

    function highlight(index) {
        var grid = state.section ? state.section.querySelector('[data-role="grid"]') : null;
        if (!grid) return;
        var cards = grid.querySelectorAll('[data-index]');
        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.toggle('is-current', Number(cards[i].getAttribute('data-index')) === index);
        }
    }

    function select(movie) {
        if (!movie) return;
        if (state.selected && String(state.selected.id) === String(movie.id)) return;
        state.selected = movie;
        renderDetail(movie);
    }

    function renderCategories(section) {
        var container = section.querySelector('[data-role="cats"]');
        container.innerHTML = '';

        (state.catalog.movies.categories || []).forEach(function (category) {
            var button = App.el('button', 'list-item focusable', '');
            button.type = 'button';
            button.setAttribute('data-cat', category.id);
            if (category.id === state.categoryId) button.classList.add('is-active');
            button.innerHTML =
                '<span class="list-item-body"><span class="list-item-title">' +
                    App.esc(category.name) + '</span></span>' +
                '<span class="list-item-badge">' + category.count + '</span>';
            container.appendChild(button);
        });
    }

    function selectCategory(section, categoryId, focusFirst) {
        state.categoryId = categoryId;
        state.selected = null;

        var cats = section.querySelectorAll('[data-cat]');
        for (var i = 0; i < cats.length; i++) {
            cats[i].classList.toggle('is-active', cats[i].getAttribute('data-cat') === categoryId);
        }

        var category = state.catalog.movies.categories.filter(function (item) {
            return String(item.id) === String(categoryId);
        })[0];

        section.querySelector('[data-role="cat-name"]').textContent = category ? category.name : 'Filmes';
        state.items = App.items('movies', categoryId);
        section.querySelector('[data-role="count"]').textContent =
            state.items.length + (state.items.length === 1 ? ' filme' : ' filmes');

        var grid = section.querySelector('[data-role="grid"]');
        var detail = section.querySelector('[data-role="detail"]');
        grid.innerHTML = '';
        detail.innerHTML = '';

        if (!state.items.length) {
            grid.innerHTML = '<p class="empty">Nenhum filme nesta categoria.</p>';
            return;
        }

        App.renderList(grid, state.items, movieCard, { chunk: 60 });

        if (focusFirst) {
            var first = grid.querySelector('[data-index]');
            if (first) App.focus(first);
        }

        select(state.items[0]);
    }

    function toggleFavorite() {
        if (!state.selected) return;

        var added = App.toggleFavorite('movies', {
            id: state.selected.id,
            name: state.selected.name,
            poster: state.selected.poster,
            url: state.selected.url,
            ext: state.selected.ext,
            year: state.selected.year,
            rating: state.selected.rating
        });

        var button = state.section.querySelector('[data-action="fav"]');
        if (button) {
            button.textContent = added ? '★ Favorito' : '☆ Favorito';
            button.classList.toggle('is-fav', added);
        }
    }

    function playSelected() {
        if (!state.selected) return;
        App.playMovie(state.selected);
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

            var card = target.closest('[data-index]');
            if (card) {
                var index = Number(card.getAttribute('data-index'));
                var movie = state.items[index];
                if (movie) {
                    select(movie);
                    highlight(index);
                    App.playMovie(movie);
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
            var card = event.target && event.target.closest ? event.target.closest('[data-index]') : null;
            if (!card) return;

            var index = Number(card.getAttribute('data-index'));
            var movie = state.items[index];
            if (!movie) return;

            select(movie);
            highlight(index);
        });
    }

    var Movies = {
        render: function (section) {
            state.section = section;
            state.catalog = null;
            state.selected = null;
            state.query = '';

            buildShell(section);
            bindEvents(section);

            App.loader(true, 'Carregando filmes...');

            App.loadCatalog().then(function (catalog) {
                App.loader(false);
                state.catalog = catalog;

                if (!catalog.movies.items.length) {
                    section.querySelector('[data-role="grid"]').innerHTML =
                        '<p class="empty">Esta lista não possui filmes.</p>';
                    return;
                }

                renderCategories(section);
                selectCategory(section, 'all', true);
            }).catch(function (error) {
                App.loader(false);
                section.querySelector('[data-role="grid"]').innerHTML =
                    '<p class="empty">' + App.esc(error && error.message || 'Falha ao carregar os filmes.') + '</p>';
                App.toast(error && error.message || 'Falha ao carregar os filmes.');
            });
        },

        onKey: function (code) {
            if (code === App.KEY.YELLOW) {
                toggleFavorite();
                return true;
            }
            return false;
        },

        destroy: function () {
            state.infoToken++;
            state.section = null;
            state.selected = null;
        }
    };

    App.registerView('movies', Movies);

})(window);
