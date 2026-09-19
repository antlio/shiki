import type { LanguageRegistration } from '@shikijs/types'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import { describe, expect, it } from 'vitest'
import { createShikiPrimitiveAsync, Registry, Resolver } from '../src'

const RE_MISSING_LANG_ERROR = /Missing languages `missing-lang`, required by `test-lang`/

describe('repro issue', () => {
  it('should throw error when missing embeddedLanguages', async () => {
    const shiki = await createShikiPrimitiveAsync({
      engine: createJavaScriptRegexEngine(),
      themes: [],
      langs: [],
    })

    await expect(shiki.loadLanguage({
      name: 'test-lang',
      scopeName: 'source.test',
      embeddedLanguages: ['missing-lang'],
      patterns: [],
      repository: {},
    }))
      .rejects
      .toThrowError(RE_MISSING_LANG_ERROR)
  })
})

describe('injection registration', () => {
  const host: LanguageRegistration = {
    name: 'host',
    scopeName: 'source.host',
    patterns: [],
    repository: {},
  }
  const first: LanguageRegistration = {
    name: 'first',
    scopeName: 'source.first',
    injectTo: [host.scopeName],
    injectionSelector: `L:${host.scopeName}`,
    patterns: [{ match: 'INJECT', name: 'keyword.first' }],
    repository: {},
  }
  const second: LanguageRegistration = {
    ...first,
    name: 'second',
    scopeName: 'source.second',
    patterns: [{ match: 'INJECT', name: 'keyword.second' }],
  }

  const reloadCases: [name: string, reload: LanguageRegistration[]][] = [
    ['empty', []],
    ['duplicate', [first]],
  ]

  it.each(reloadCases)('keeps injections unique and ordered after %s language loads', (_name, reload) => {
    const langs = [host, first, second]
    const resolver = new Resolver(createJavaScriptRegexEngine(), langs)
    const registry = new Registry(resolver, [], langs)

    try {
      for (let i = 0; i < 3; i++) {
        registry.loadLanguages(reload)

        expect(resolver.getInjections(host.scopeName)).toEqual([first.scopeName, second.scopeName])
      }

      // compile a fresh host because existing grammars cache their injections
      const child = { ...host, name: 'child', scopeName: `${host.scopeName}.child` }
      registry.loadLanguages([child])
      expect(registry.getGrammar(child.name)!.tokenizeLine('INJECT', null).tokens[0].scopes)
        .toEqual([child.scopeName, 'keyword.first'])
    }
    finally {
      registry.dispose()
    }
  })

  it('preserves injections registered for different scope prefixes', () => {
    const shared = { ...first, injectTo: ['source', host.scopeName] }
    const resolver = new Resolver(createJavaScriptRegexEngine(), [shared, second])

    resolver.addLanguage(shared)

    expect(resolver.getInjections(host.scopeName)).toEqual([
      first.scopeName,
      first.scopeName,
      second.scopeName,
    ])
  })
})
