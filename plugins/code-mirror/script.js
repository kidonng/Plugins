/**
 * @name code-mirror 语法高亮编辑器
 * @author 机智的小鱼君 <https://github.com/Dragon-Fish>
 * @author Bhsd <https://github.com/bhsd-harry>
 */
;(async () => {
  const codemirrorInstalled = mw.loader.getState('ext.CodeMirror')
  const settings = JSON.parse(localStorage.getItem('InPageEditMwConfig')) || {}
  const serverName = mw.config.get('wgServerName') + mw.config.get('wgScriptPath')
  const localSetting = settings[serverName]
  const MODE_LIST = codemirrorInstalled ? {
    css: ['ext.CodeMirror.lib.mode.css'],
    javascript: ['ext.CodeMirror.lib.mode.javascript'],
    lua: 'https://cdn.jsdelivr.net/npm/codemirror@5.65.1/mode/lua/lua.min.js',
    mediawiki: ['ext.CodeMirror.mode.mediawiki', 'ext.CodeMirror.data'],
    widget: ['ext.CodeMirror.lib.mode.htmlmixed', 'ext.CodeMirror.mode.mediawiki', 'ext.CodeMirror.data']
  } : {
    css: 'https://cdn.jsdelivr.net/npm/codemirror@5.65.1/mode/css/css.min.js',
    javascript:
      'https://cdn.jsdelivr.net/npm/codemirror@5.65.1/mode/javascript/javascript.min.js',
    lua: 'https://cdn.jsdelivr.net/npm/codemirror@5.65.1/mode/lua/lua.min.js',
    mediawiki:
      'https://cdn.jsdelivr.net/gh/wikimedia/mediawiki-extensions-CodeMirror@REL1_37/resources/mode/mediawiki/mediawiki.min.js',
    htmlmixed: 'https://cdn.jsdelivr.net/npm/codemirror@5.65.1/mode/htmlmixed/htmlmixed.min.js',
    xml: 'https://cdn.jsdelivr.net/npm/codemirror@5.65.1/mode/xml/xml.min.js',
    widget: null
  }

  if (!codemirrorInstalled) {
    mw.loader.load(
      'https://cdn.jsdelivr.net/npm/codemirror@5.65.1/lib/codemirror.min.css',
      'text/css'
    )
  }
  mw.loader.load(
    'https://ipe-plugins.js.org/plugins/code-mirror/style.css',
    'text/css'
  )

  function getScript(url) {
    return typeof url === 'string' ? $.ajax({
      url,
      dataType: 'script',
      crossDomain: true,
      cache: true,
    }) : mw.loader.using(url.flat())
  }

  // Load Code Mirror
  await codemirrorInstalled ? mw.loader.using('ext.CodeMirror.lib') : getScript(
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.1/lib/codemirror.min.js'
  )
  // Load addons
  const ADDON_LIST = [
    'selection/active-line.min.js',
    'dialog/dialog.js',
    'search/searchcursor.js',
    'search/search.js',
  ]
  await Promise.all(
    ADDON_LIST.map(i =>
      getScript(`https://cdn.jsdelivr.net/npm/codemirror@5.65.1/addon/${i}`)
    )
  )

  /** @type {Record<string, boolean>} */
  const LOADED_MODE = {}
  /**
   * 加载渲染器
   * @param {String} type
   */
  async function initMode(type) {
    // 已经加载过的渲染器
    if (LOADED_MODE[type] === true) {
      return true
    }
    // 加载渲染器
    if (MODE_LIST[type] === undefined) return false
    if (type === 'widget') {
      if (codemirrorInstalled) {
        await getScript(MODE_LIST[type])
        LOADED_MODE.css = true
        LOADED_MODE.javascript = true
        LOADED_MODE.mediawiki = true
      } else {
        await Promise.all(['css', 'javascript', 'mediawiki', 'htmlmixed', 'xml'].map(initMode))
      }
      CodeMirror.defineMIME('widget', {name: 'htmlmixed', tags: {
        noinclude: [[null, null, 'mediawiki']]
      }})
    } else {
      if (type === 'mediawiki' && !codemirrorInstalled) {
        mw.loader.load(
          'https://cdn.jsdelivr.net/gh/wikimedia/mediawiki-extensions-CodeMirror@REL1_37/resources/mode/mediawiki/mediawiki.min.css',
          'text/css'
        )
      }
      await getScript(MODE_LIST[type])
    }
    LOADED_MODE[type] = true
    return true
  }

  /**
   * 加载codemirror的mediawiki模块需要的设置数据
   */
  const getMwConfig = async (type) => {
    /** @type {{ tagModes: { pre: string, nowiki:string }, tags: Record<string, boolean>, doubleUnderscore: Record<string, boolean>[], functionSynonyms: Record<string, boolean>[], urlProtocols: string }} */
    if (!['mediawiki', 'widget'].includes(type)) {
      return
    }
    let config = mw.config.get('extCodeMirrorConfig')
    if (config) {
      return config
    }
    if (localSetting?.time > Date.now() - 86400 * 1000 * 3) {
      config = localSetting.config
      mw.config.set('extCodeMirrorConfig', config)
      return config
    }
    config = {}

    const {
      query: { magicwords, extensiontags, functionhooks, variables },
    } = await new mw.Api().get({
      action: 'query',
      meta: 'siteinfo',
      siprop: 'magicwords|extensiontags|functionhooks|variables',
      format: 'json',
      formatversion: 2,
    })
    const getAliases = words => words.flatMap(({ aliases }) => aliases),
      getConfig = aliases =>
        Object.fromEntries(aliases.map(alias => [alias.replace(/:$/, ''), true]))
    config.tagModes = {
      pre: 'mw-tag-pre',
      nowiki: 'mw-tag-nowiki',
    }
    config.tags = Object.fromEntries(
      extensiontags.map(tag => [tag.slice(1, -1), true])
    )
    const realMagicwords = new Set([...functionhooks, ...variables]),
      allMagicwords = magicwords.filter(({name, aliases}) =>
        aliases.some(alias => /^__.+__$/.test(alias)) || realMagicwords.has(name)
      ),
      sensitive = getAliases(
        allMagicwords.filter(word => word['case-sensitive'])
      ),
      insensitive = [
        ...getAliases(
          allMagicwords.filter(word => !word['case-sensitive'])
        ).map(alias => alias.toLowerCase()),
        'msg', 'raw', 'msgnw', 'subst', 'safesubst'
      ]
    config.doubleUnderscore = [
      getConfig(insensitive.filter(alias => /^__.+__$/.test(alias))),
      getConfig(sensitive.filter(alias => /^__.+__$/.test(alias))),
    ]
    config.functionSynonyms = [
      getConfig(insensitive.filter(alias => !/^__.+__|^#$/.test(alias))),
      getConfig(sensitive.filter(alias => !/^__.+__|^#$/.test(alias))),
    ]
    config.urlProtocols = mw.config.get('wgUrlProtocols')
    mw.config.set('extCodeMirrorConfig', config)
    settings[serverName] = {
      config,
      time: Date.now()
    }
    localStorage.setItem('InPageEditMwConfig', JSON.stringify(settings))
    return config
  }

  /**
   * 检查页面语言类型
   * @param {string} page Page name
   */
  function getPageMode(page) {
    const NS_MODULE = mw.config.get('wgFormattedNamespaces')[828] || 'Module'
    const NS_WIDGET = mw.config.get('wgFormattedNamespaces')[214] || 'Widget'
    if (page.endsWith('.css')) {
      return 'css'
    } else if (page.endsWith('.js') || page.endsWith('.json')) {
      return 'javascript'
    } else if (page.startsWith(`${NS_MODULE}:`) && !page.endsWith('/doc')) {
      return 'lua'
    } else if (page.startsWith(`${NS_WIDGET}:`) && !page.endsWith('/doc')) {
      return 'widget'
    } else {
      return 'mediawiki'
    }
  }

  /**
   * 渲染编辑器
   * @param {JQuery<HTMLTextAreaElement>} target 目标编辑框
   * @param {string} page 页面名
   */
  async function renderEditor(target, page) {
    // 防止抑郁
    const clearDiv = '<div style="clear: both"></div>'
    target.before(clearDiv)
    target.after(clearDiv)

    let mode = getPageMode(page)
    const [mwConfig] = await Promise.all([getMwConfig(mode), initMode(mode)])

    if (target.length) {
      const cm = CodeMirror.fromTextArea(target[0], {
        lineNumbers: true,
        lineWrapping: true,
        styleActiveLine: true,
        extraKeys: { 'Alt-F': 'findPersistent' },
        theme: `inpageedit ${
          globalThis.InPageEditCodeMirrorTheme === 'dark' ? 'dark' : 'light'
        }`,
        json: page.endsWith('.json'),
        mode,
        mwConfig,
      })
      cm.on('change', function (_, {origin}) {
        if (origin == 'setValue') {
          return
        }
        target.trigger('input')
        target.trigger('change')
      })
      $.valHooks.textarea = {
        get: function (elem) {
          if (elem === target[0]) return cm.getValue()
          else return elem.value
        },
        set: function (elem, value) {
          if (elem === target[0]) cm.setValue(value)
          else elem.value = value
        },
      }
      var origTextSelection = $.fn.textSelection
      $.fn.textSelection = function (command, options) {
        if (cm.getTextArea() !== this[0]) {
          return origTextSelection.call(this, command, options)
        }
        var fn, retval

        fn = {
          /**
           * Get the contents of the textarea
           */
          getContents: function () {
            return cm.doc.getValue()
          },

          setContents: function (newContents) {
            cm.doc.setValue(newContents)
          },

          /**
           * Get the currently selected text in this textarea. Will focus the textarea
           * in some browsers (IE/Opera)
           */
          getSelection: function () {
            return cm.doc.getSelection()
          },

          /**
           * Inserts text at the beginning and end of a text selection, optionally
           * inserting text at the caret when selection is empty.
           */
          encapsulateSelection: function (options) {
            return this.each(function () {
              var insertText,
                selText,
                selectPeri = options.selectPeri,
                pre = options.pre,
                post = options.post,
                startCursor = cm.doc.getCursor(true),
                endCursor = cm.doc.getCursor(false)

              if (options.selectionStart !== undefined) {
                // fn[command].call( this, options );
                fn.setSelection({
                  start: options.selectionStart,
                  end: options.selectionEnd,
                }) // not tested
              }

              selText = cm.doc.getSelection()
              if (!selText) {
                selText = options.peri
              } else if (options.replace) {
                selectPeri = false
                selText = options.peri
              } else {
                selectPeri = false
                while (selText.charAt(selText.length - 1) === ' ') {
                  // Exclude ending space char
                  selText = selText.substring(0, selText.length - 1)
                  post += ' '
                }
                while (selText.charAt(0) === ' ') {
                  // Exclude prepending space char
                  selText = selText.substring(1, selText.length)
                  pre = ' ' + pre
                }
              }

              /**
               * Do the splitlines stuff.
               *
               * Wrap each line of the selected text with pre and post
               */
              function doSplitLines(selText, pre, post) {
                var i,
                  insertText = '',
                  selTextArr = selText.split('\n')

                for (i = 0; i < selTextArr.length; i++) {
                  insertText += pre + selTextArr[i] + post
                  if (i !== selTextArr.length - 1) {
                    insertText += '\n'
                  }
                }
                return insertText
              }

              if (options.splitlines) {
                selectPeri = false
                insertText = doSplitLines(selText, pre, post)
              } else {
                insertText = pre + selText + post
              }

              if (options.ownline) {
                if (startCursor.ch !== 0) {
                  insertText = '\n' + insertText
                  pre += '\n'
                }

                if (cm.doc.getLine(endCursor.line).length !== endCursor.ch) {
                  insertText += '\n'
                  post += '\n'
                }
              }

              cm.doc.replaceSelection(insertText)

              if (selectPeri) {
                cm.doc.setSelection(
                  cm.doc.posFromIndex(
                    cm.doc.indexFromPos(startCursor) + pre.length
                  ),
                  cm.doc.posFromIndex(
                    cm.doc.indexFromPos(startCursor) +
                      pre.length +
                      selText.length
                  )
                )
              }
            })
          },

          /**
           * Get the position (in resolution of bytes not necessarily characters)
           * in a textarea
           */
          getCaretPosition: function (options) {
            var caretPos = cm.doc.indexFromPos(cm.doc.getCursor(true)),
              endPos = cm.doc.indexFromPos(cm.doc.getCursor(false))
            if (options.startAndEnd) {
              return [caretPos, endPos]
            }
            return caretPos
          },

          setSelection: function (options) {
            return this.each(function () {
              cm.doc.setSelection(
                cm.doc.posFromIndex(options.start),
                cm.doc.posFromIndex(options.end)
              )
            })
          },

          /**
           * Scroll a textarea to the current cursor position. You can set the cursor
           * position with setSelection()
           */
          scrollToCaretPosition: function () {
            return this.each(function () {
              cm.scrollIntoView(null)
            })
          },
        }

        switch (command) {
          // case 'getContents': // no params
          // case 'setContents': // no params with defaults
          // case 'getSelection': // no params
          case 'encapsulateSelection':
            options = $.extend(
              {
                pre: '', // Text to insert before the cursor/selection
                peri: '', // Text to insert between pre and post and select afterwards
                post: '', // Text to insert after the cursor/selection
                ownline: false, // Put the inserted text on a line of its own
                replace: false, // If there is a selection, replace it with peri instead of leaving it alone
                selectPeri: true, // Select the peri text if it was inserted (but not if there was a selection and replace==false, or if splitlines==true)
                splitlines: false, // If multiple lines are selected, encapsulate each line individually
                selectionStart: undefined, // Position to start selection at
                selectionEnd: undefined, // Position to end selection at. Defaults to start
              },
              options
            )
            break
          case 'getCaretPosition':
            options = $.extend(
              {
                // Return [start, end] instead of just start
                startAndEnd: false,
              },
              options
            )
            // FIXME: We may not need character position-based functions if we insert markers in the right places
            break
          case 'setSelection':
            options = $.extend(
              {
                // Position to start selection at
                start: undefined,
                // Position to end selection at. Defaults to start
                end: undefined,
                // Element to start selection in (iframe only)
                startContainer: undefined,
                // Element to end selection in (iframe only). Defaults to startContainer
                endContainer: undefined,
              },
              options
            )

            if (options.end === undefined) {
              options.end = options.start
            }
            if (options.endContainer === undefined) {
              options.endContainer = options.startContainer
            }
            // FIXME: We may not need character position-based functions if we insert markers in the right places
            break
          case 'scrollToCaretPosition':
            options = $.extend(
              {
                force: false, // Force a scroll even if the caret position is already visible
              },
              options
            )
            break
        }

        retval = fn[command].call(this, options)

        return retval
      }
      return cm
    }
  }

  /**
   * 为 quickEdit 钩子添加函数
   */
  mw.hook('InPageEdit.quickEdit').add(({ $editArea, $modalTitle }) => {
    (async () => {
      const page = $modalTitle.find('.editPage').text()
      const cm = await renderEditor($editArea, page)
      mw.hook('InPageEdit.quickEdit.codemirror').fire({ $editArea, cm })
    })()
  })
})()
