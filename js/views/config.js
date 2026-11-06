/*
 * views/config.js
 * Configurações e gestão de listas: cadastro/edição de contas Xtream Codes
 * e M3U, teste de conexão, exclusão e troca da lista ativa.
 */
(function (global) {
    'use strict';

    var App = global.App;

    var state = {
        section: null,
        editingId: '',
        type: 'xtream'
    };

    function buildShell(section) {
        section.innerHTML =
            '<div class="layout layout-config">' +
                '<aside class="pane pane-cats">' +
                    '<h2 class="pane-title">Minhas listas</h2>' +
                    '<div class="list scroll" data-role="accounts"></div>' +
                    '<button type="button" class="btn btn-primary btn-block focusable" data-action="new">+ Nova lista</button>' +
                '</aside>' +
                '<div class="pane pane-form">' +
                    '<h2 class="pane-title" data-role="form-title">Nova lista</h2>' +
                    '<form class="form-grid" autocomplete="off" data-role="form">' +
                        '<div class="form-row">' +
                            '<label class="form-label">Nome da lista</label>' +
                            '<input class="input focusable" type="text" data-field="name" placeholder="Minha lista principal">' +
                        '</div>' +
                        '<div class="form-row">' +
                            '<span class="form-label">Tipo de lista</span>' +
                            '<div class="type-toggle">' +
                                '<button type="button" class="chip focusable" data-type="xtream">Xtream Codes</button>' +
                                '<button type="button" class="chip focusable" data-type="m3u">M3U / M3U8</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="form-row">' +
                            '<label class="form-label" data-role="url-label">URL do servidor</label>' +
                            '<input class="input focusable" type="text" data-field="url" placeholder="http://servidor.com:8080">' +
                        '</div>' +
                        '<div class="form-row" data-when="xtream">' +
                            '<label class="form-label">Usuário</label>' +
                            '<input class="input focusable" type="text" data-field="username">' +
                        '</div>' +
                        '<div class="form-row" data-when="xtream">' +
                            '<label class="form-label">Senha</label>' +
                            '<input class="input focusable" type="password" data-field="password">' +
                        '</div>' +
                        '<div class="form-actions">' +
                            '<button type="button" class="btn btn-primary focusable" data-action="save">Salvar e ativar</button>' +
                            '<button type="button" class="btn focusable" data-action="test">Testar conexão</button>' +
                            '<button type="button" class="btn btn-danger focusable" data-action="delete">Excluir</button>' +
                        '</div>' +
                        '<p class="footer-hint">Na lista Xtream informe a URL com a porta, por exemplo http://servidor.com:8080.</p>' +
                    '</form>' +
                '</div>' +
            '</div>';
    }

    function form(section) {
        return section.querySelector('[data-role="form"]');
    }

    function field(section, name) {
        return section.querySelector('[data-field="' + name + '"]');
    }

    function setType(type) {
        state.type = type === 'm3u' ? 'm3u' : 'xtream';

        var section = state.section;
        if (!section) return;

        var chips = section.querySelectorAll('[data-type]');
        for (var i = 0; i < chips.length; i++) {
            chips[i].classList.toggle('is-active',
                chips[i].getAttribute('data-type') === state.type);
        }

        var xtreamRows = section.querySelectorAll('[data-when="xtream"]');
        for (var j = 0; j < xtreamRows.length; j++) {
            xtreamRows[j].hidden = state.type !== 'xtream';
        }

        section.querySelector('[data-role="url-label"]').textContent =
            state.type === 'm3u' ? 'URL da lista M3U' : 'URL do servidor';
        field(section, 'url').placeholder = state.type === 'm3u'
            ? 'http://servidor.com/lista.m3u'
            : 'http://servidor.com:8080';
    }

    function fillForm(account) {
        var section = state.section;
        if (!section) return;

        state.editingId = account ? account.id : '';

        field(section, 'name').value = account ? account.name : '';
        field(section, 'url').value = account ? account.url : '';
        field(section, 'username').value = account ? (account.username || '') : '';
        field(section, 'password').value = account ? (account.password || '') : '';

        setType(account ? account.type : 'xtream');

        section.querySelector('[data-role="form-title"]').textContent =
            account ? 'Editar lista' : 'Nova lista';

        var deleteBtn = section.querySelector('[data-action="delete"]');
        if (deleteBtn) deleteBtn.hidden = !account;
    }

    function readForm() {
        var section = state.section;
        return {
            name: field(section, 'name').value.trim(),
            url: field(section, 'url').value.trim(),
            username: field(section, 'username').value.trim(),
            password: field(section, 'password').value,
            type: state.type
        };
    }

    function validate(data) {
        if (!data.url) return 'Informe a URL do servidor ou da lista.';

        if (state.type === 'xtream') {
            if (!/^https?:\/\//i.test(data.url)) {
                return 'A URL Xtream deve começar com http:// ou https://.';
            }
            if (!data.username || !data.password) {
                return 'Informe usuário e senha da lista Xtream.';
            }
        } else {
            if (!/^(https?|file):\/\//i.test(data.url)) {
                return 'Informe a URL completa do arquivo M3U (http://...).';
            }
        }

        return '';
    }

    function withLoader(message, task) {
        App.loader(true, message);
        return task().then(function (value) {
            App.loader(false);
            return value;
        }, function (error) {
            App.loader(false);
            throw error;
        });
    }

    function testConnection(data) {
        if (state.type === 'xtream') {
            var api = new global.Xtream(data);
            return api.auth();
        }
        return global.M3UParser.load(data.url);
    }

    function renderAccounts() {
        var section = state.section;
        if (!section) return;

        var container = section.querySelector('[data-role="accounts"]');
        var accounts = global.Store.getAccounts();
        var active = global.Store.getActiveAccount();

        container.innerHTML = '';

        if (!accounts.length) {
            container.innerHTML = '<p class="empty">Nenhuma lista cadastrada.</p>';
            return;
        }

        accounts.forEach(function (account) {
            var row = App.el('button', 'list-item focusable', '');
            row.type = 'button';
            row.setAttribute('data-account', account.id);
            if (String(account.id) === String(state.editingId)) row.classList.add('is-active');
            row.innerHTML =
                '<span class="list-item-icon list-item-icon--empty">' +
                    App.esc(App.initials(account.name)) +
                '</span>' +
                '<span class="list-item-body">' +
                    '<span class="list-item-title">' + App.esc(account.name) + '</span>' +
                    '<span class="list-item-sub">' +
                        App.esc(account.type === 'm3u' ? 'M3U' : 'Xtream Codes') +
                    '</span>' +
                '</span>' +
                (active && String(active.id) === String(account.id)
                    ? '<span class="list-item-badge is-active">Ativa</span>'
                    : '');
            container.appendChild(row);
        });
    }

    function save() {
        var section = state.section;
        var data = readForm();
        var problem = validate(data);

        if (problem) {
            App.toast(problem);
            return;
        }

        var account = global.Store.upsertAccount({
            id: state.editingId || undefined,
            name: data.name,
            type: data.type,
            url: data.url,
            username: data.username,
            password: data.password
        });

        global.Store.setActiveAccount(account.id);
        App.invalidateCatalog(account.id);
        state.editingId = account.id;
        renderAccounts();

        withLoader('Validando lista...', function () {
            return App.loadCatalog(true);
        }).then(function () {
            App.toast('Lista salva e ativada');
            App.navigate('home', {});
        }).catch(function (error) {
            App.toast('Lista salva, mas falhou ao carregar: ' +
                (error && error.message ? error.message : 'erro desconhecido'));
        });
    }

    function test() {
        var data = readForm();
        var problem = validate(data);

        if (problem) {
            App.toast(problem);
            return;
        }

        withLoader('Testando conexão...', function () {
            return testConnection(data);
        }).then(function () {
            App.toast('Conexão estabelecida com sucesso');
        }).catch(function (error) {
            App.toast('Falha na conexão: ' +
                (error && error.message ? error.message : 'erro desconhecido'), 4000);
        });
    }

    function remove() {
        if (!state.editingId) {
            App.toast('Selecione uma lista da coluna ao lado para excluir.');
            return;
        }

        var account = global.Store.getAccount(state.editingId);
        if (!account) return;

        App.confirm('Excluir lista', 'Deseja remover “' + account.name + '”? ' +
            'Os favoritos salvos não serão apagados.', { confirmText: 'Excluir' })
            .then(function (confirmed) {
                if (!confirmed) return;

                global.Store.deleteAccount(account.id);
                App.invalidateCatalog(account.id);
                state.editingId = '';

                var remaining = global.Store.getAccounts();
                if (!remaining.length) {
                    global.Store.setActiveAccount('');
                    App.toast('Lista removida');
                    App.replace('login', {});
                    return;
                }

                App.toast('Lista removida');
                renderAccounts();
                fillForm(null);
            });
    }

    function bindEvents(section) {
        form(section).addEventListener('submit', function (event) {
            event.preventDefault();
        });

        section.addEventListener('click', function (event) {
            if (App.dialogOpen()) return;

            var target = event.target;
            if (!target || !target.closest) return;

            var typeBtn = target.closest('[data-type]');
            if (typeBtn) {
                setType(typeBtn.getAttribute('data-type'));
                return;
            }

            var action = target.closest('[data-action]');
            if (action) {
                var name = action.getAttribute('data-action');
                if (name === 'new') {
                    fillForm(null);
                    App.focus(field(section, 'name'));
                } else if (name === 'save') {
                    save();
                } else if (name === 'test') {
                    test();
                } else if (name === 'delete') {
                    remove();
                }
                return;
            }

            var row = target.closest('[data-account]');
            if (row) {
                var account = global.Store.getAccount(row.getAttribute('data-account'));
                if (!account) return;
                fillForm(account);
                renderAccounts();
                App.focus(field(section, 'name'));
            }
        });
    }

    var Config = {
        render: function (section, payload) {
            state.section = section;
            state.editingId = '';

            buildShell(section);
            bindEvents(section);
            fillForm(null);
            renderAccounts();

            var active = global.Store.getActiveAccount();
            if (active && !(payload && payload.newAccount)) {
                fillForm(active);
                renderAccounts();
            }

            var focusTarget = (payload && payload.newAccount)
                ? field(section, 'name')
                : (section.querySelector('[data-account]') || field(section, 'name'));
            if (focusTarget) App.focus(focusTarget);
        },

        onKey: function () {
            return false;
        },

        destroy: function () {
            state.section = null;
        }
    };

    App.registerView('config', Config);

})(window);
