/*
 * views/login.js
 * Primeira tela do app: lista as contas cadastradas e permite escolher uma
 * ou abrir a tela de configurações para adicionar uma nova lista.
 */
(function (global) {
    'use strict';

    var App = global.App;

    function accountRow(account) {
        var row = App.el('button', 'list-item list-account focusable', '');
        row.type = 'button';
        row.setAttribute('data-account', account.id);
        row.innerHTML =
            '<span class="list-item-icon list-item-icon--empty">' + App.esc(App.initials(account.name)) + '</span>' +
            '<span class="list-item-body">' +
                '<span class="list-item-title">' + App.esc(account.name) + '</span>' +
                '<span class="list-item-sub">' +
                    App.esc(account.type === 'm3u' ? 'Lista M3U' : 'Xtream Codes') + ' · ' +
                    App.esc(account.url || 'sem endereço') +
                '</span>' +
            '</span>' +
            '<span class="list-item-badge">' + (account.type === 'm3u' ? 'M3U' : 'XTREAM') + '</span>';
        return row;
    }

    function renderAccounts(section, accounts) {
        var container = section.querySelector('[data-role="accounts"]');
        container.innerHTML = '';

        if (!accounts.length) {
            container.innerHTML =
                '<p class="empty">Nenhuma lista cadastrada ainda.<br>' +
                'Use “Adicionar lista” para informar seu servidor Xtream ou a URL de uma lista M3U.</p>';
            return;
        }

        accounts.forEach(function (account) {
            container.appendChild(accountRow(account));
        });
    }

    function activate(account) {
        if (!account) return;
        global.Store.setActiveAccount(account.id);
        App.invalidateCatalog(account.id);
        App.navigate('home', {});
    }

    var Login = {
        render: function (section) {
            var accounts = global.Store.getAccounts();

            section.innerHTML =
                '<div class="login">' +
                    '<div class="login-hero">' +
                        '<h1>IPTV Player</h1>' +
                        '<p>Escolha uma lista para começar</p>' +
                    '</div>' +
                    '<div class="login-body">' +
                        '<div class="panel">' +
                            '<h2>Minhas listas</h2>' +
                            '<div class="list scroll" data-role="accounts"></div>' +
                        '</div>' +
                        '<div class="panel panel-side">' +
                            '<button type="button" class="btn btn-primary focusable" data-action="add">+ Adicionar lista</button>' +
                            '<button type="button" class="btn focusable" data-action="config">Configurações</button>' +
                            '<p class="footer-hint">Suporte a Xtream Codes e listas M3U / M3U8.</p>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            renderAccounts(section, accounts);

            section.addEventListener('click', function (event) {
                if (App.dialogOpen()) return;

                var target = event.target;
                if (!target || !target.closest) return;

                var addBtn = target.closest('[data-action="add"]');
                if (addBtn) {
                    App.navigate('config', { newAccount: true });
                    return;
                }

                var configBtn = target.closest('[data-action="config"]');
                if (configBtn) {
                    App.navigate('config', {});
                    return;
                }

                var row = target.closest('[data-account]');
                if (row) {
                    activate(global.Store.getAccount(row.getAttribute('data-account')));
                }
            });

            var first = section.querySelector('[data-account]');
            if (!first) first = section.querySelector('[data-action="add"]');
            if (first) App.focus(first);
        },

        onKey: function () {
            return false;
        }
    };

    App.registerView('login', Login);

})(window);
