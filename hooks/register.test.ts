import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'

const usage = { input_tokens: 10, output_tokens: 1 } as never

const setup = (on: On, reply: string, seen: string[]) => {
  const store: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('model.complete', () => ({ value: { isAnswered: true, text: reply, usage } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    seen.push(e.model)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
}

const step = async ($: Parameters<TestBody>[0], turnId: string) => {
  for await (const _ of $.turn.step({ turnId, index: 0, model: 'session-model', messageCount: 1 })) {
  }
}

test('une demande complexe part vers Opus', async ($, on) => {
  const seen: string[] = []
  setup(on, 'COMPLEXE', seen)
  await $.turn.start({ text: "Refactore toute l'architecture du module de paiement", turnId: 't1' })
  await step($, 't1')
  expect(seen).toEqual(['opus'])
})

test('une demande simple part vers Haiku', async ($, on) => {
  const seen: string[] = []
  setup(on, 'SIMPLE', seen)
  await $.turn.start({ text: 'Bonjour', turnId: 't1' })
  await step($, 't1')
  expect(seen).toEqual(['haiku'])
})

test('les sous-agents gardent leur modèle', async ($, on) => {
  const seen: string[] = []
  setup(on, 'COMPLEXE', seen)
  await $.turn.start({ text: 'Analyse ce bug difficile', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'sub-model', messageCount: 1, agentId: 'a1' })) {
  }
  expect(seen).toEqual(['sub-model'])
})
