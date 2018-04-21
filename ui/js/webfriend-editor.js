'use strict';

var EditorFile = Stapes.subclass({
    constructor: function (buffer, editor) {
        this.index = buffer.index;
        this.editor = editor;
        this.element = d3.select(this.editor.files)
            .append('div')
            .attr('class', 'editor-file')
            .attr('id', 'editor_' + buffer.index)

        this.cm = CodeMirror(document.getElementById('editor_' + buffer.index), {
            mode: 'friendscript',
            theme: 'webfriend',
            indentUnit: 4,
            tabSize: 4,
            lineNumbers: true,
            autofocus: true,
            styleActiveLine: true,
        });

        if (buffer.content) {
            this.cm.setValue(buffer.content);
        }

        this.cm.on('cursorActivity', function(cm) {
            this.editor.updateStatusBar(this, cm);
        }.bind(this));

        this.cm.on('changes', function(cm){
            this.persist()
        }.bind(this));
    },

    persist: function() {
        this.editor.updateBuffer(this.index, {
            'index': this.index,
            'content': this.cm.getValue(),
            'timestamp': Date.now(),
        });
    },
});

var Editor = Stapes.subclass({
    constructor: function (container) {
        this.AUTOSAVE_INTERVAL = 10000;
        this.MIN_AUTOSAVE_INTERVAL_MS = 5000;
        this.SCROLL_FILES_LOOPAROUND = false;

        d3.select(container || 'body').append('div').attr('id', 'editor');

        this.container = '#editor';
        this.editors = [];
        this.activeIndex = null;

        this.buildSkeleton();
        this.loadBuffers();

        if (!this.editors.length) {
            var buffer = this.createFile();
            this.switchToEditor(buffer.index);
        } else {
            this.switchToEditor(this.editors[0].file.index);
        }
    },

    loadBuffers: function() {
        $.each(this.getAllBuffers(), function(i, buffer) {
            console.log(i, buffer)
            this.createFile(buffer);
        }.bind(this));
    },

    createFile: function (buffer) {
        if ($.isPlainObject(buffer) && Object.keys(buffer).length) {
            buffer.index = (buffer.index || this.editors.length).toString();
        } else {
            buffer = {
                'index': this.editors.length,
                'content': '',
            };
        }


        this.updateBuffer(buffer.index, buffer);
        buffer = this.retrieveBuffer(buffer.index);

        this.editors.push({
            'editor': this,
            'file': new EditorFile(buffer, this),
        });

        this.updateFilebar();
        return buffer;
    },

    buildSkeleton: function () {
        // Filebar
        // -----------------------------------------------------------------------------------------
        var filebar = d3.select(this.container)
            .append('div')
            .attr('class', 'filebar');

        filebar
            .append('ul')
            .attr('class', 'nav nav-tabs workspace-selector');

        filebar
            .append('ul')
            .attr('class', 'nav nav-tabs open-files');

        var actions = filebar
            .append('ul')
            .attr('class', 'nav nav-tabs file-actions');

        actions
            .append('li').attr('class', 'nav-item')
            .append('a').attr('class', 'nav-link new-file')
            .append('i').attr('class', 'fa fa-fw fa-plus');

        // Files View
        // -----------------------------------------------------------------------------------------
        d3.select(this.container)
            .append('div')
            .attr('class', 'files');

        // Statusbar
        // -----------------------------------------------------------------------------------------
        var sb = d3.select(this.container)
            .append('div')
            .attr('class', 'statusbar')
            .append('div')
            .attr('class', 'statusbar-cursor');

        sb.append('span').text('Line ');
        sb.append('span').attr('class', 'line').text('-');
        sb.append('span').text(',Col ');
        sb.append('span').attr('class', 'ch').text('-');

        this.filebar = '#editor > .filebar';
        this.files = '#editor > .files';
        this.statusbar = '#editor > .statusbar';

        $(this.container + ' .new-file').on('click', function(){
            this.createFile()
        }.bind(this));
    },

    updateFilebar: function () {
        var li = d3.select(this.filebar + ' .open-files')
            .selectAll('li')
            .data(this.editors)
            .enter()
            .append('li')
            .attr('class', 'nav-item');

        li.exit().remove();

        // li > a (enter selection)
        var a = li.append('a')
            .attr('class', function (d) {
                if (d.editor.activeIndex == d.index) {
                    return 'nav-link active';
                } else {
                    return 'nav-link';
                }
            })
            .attr('href', '#')
            .attr('data-editor-buffer', function (d) {
                return d.index;
            })

        // li > a > file type icon
        a.append('i').attr('class', 'fa fa-fw fa-hashtag file-icon');

        // li > a > filename span
        a.append('span')
            .attr('class', 'filename')
            .text(function (d) {
                return (d.file.filename || 'untitled');
            });

        // li > a > close icon
        a.append('i')
            .attr('class', 'fa fa-fw fa-times')
    },

    switchToEditor: function (index) {
        if (index) {
            this.activeIndex = index;
            this.update();
        }
    },

    getEditorByIndex: function(index) {
        var out = null;

        $.each(this.editors, function(i, editor){
            if (editor.file.index == index) {
                out = editor;
            }
        });

        return out;
    },

    update: function() {
        this.updateFilebar();

        var editor = this.getEditorByIndex(this.activeIndex);

        if (editor) {
            this.updateStatusBar(editor.file, editor.file.cm);
        }
    },

    updateStatusBar: function (file, cm) {
        if (this.activeIndex == file.index) {
            var sb = $('#editor .statusbar');
            var cursor = cm.getCursor();

            sb.find('.line').text(cursor.line + 1);
            sb.find('.ch').text(cursor.ch + 1);
        }
    },

    updateBuffer: function (index, document) {
        if (window.localStorage) {
            localStorage.setItem('webfriend.editor.buffer.' + index, JSON.stringify(document));
            console.debug('Saved buffer', index);
        } else {
            throw 'Local Storage is not available.';
        }
    },

    retrieveBuffer: function (index) {
        if (window.localStorage) {
            var document = localStorage.getItem('webfriend.editor.buffer.' + index);

            if (document) {
                return JSON.parse(document);
            } else {
                return {};
            }
        } else {
            throw 'Local Storage is not available.';
        }
    },

    clearBuffer: function (index) {
        localStorage.removeItem('webfriend.editor.buffer.' + index);
    },

    getAllBuffers: function () {
        var buffers = [];

        $.each(Object.keys(localStorage), function (i, key) {
            key = key.replace(/^webfriend\.editor\.buffer\./, '');

            var buffer = this.retrieveBuffer(key);
            buffers.push(buffer);
        }.bind(this));

        return buffers;
    },
});

$(document).ready(function () {
    window.editor = new Editor();
});