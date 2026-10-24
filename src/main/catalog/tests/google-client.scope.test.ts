import { describe, expect, it, vi } from 'vitest'
import { createGoogleClient } from '../google-client'

// `vi.mock` é içado acima dos imports; as capturas também precisam ser.
const { jwtOpts, append, get } = vi.hoisted(() => ({
  jwtOpts: [] as { scopes: string[] }[],
  append: vi.fn(async () => ({ data: {} })),
  get: vi.fn(async () => ({ data: { values: [['r1']] } }))
}))

vi.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: class {
        constructor(opts: { scopes: string[] }) {
          jwtOpts.push(opts)
        }
      }
    },
    sheets: () => ({ spreadsheets: { values: { get, append } } }),
    drive: () => ({ files: { list: vi.fn(), get: vi.fn() } })
  }
}))

describe('createGoogleClient (SDK simulado)', () => {
  it('pede escrita em Sheets: sem ela todo append da Planilha de Analytics é recusado', () => {
    createGoogleClient({ client_email: 'sa@x', private_key: 'k' })
    const { scopes } = jwtOpts.at(-1)!
    expect(scopes).toContain('https://www.googleapis.com/auth/spreadsheets')
    expect(scopes).not.toContain('https://www.googleapis.com/auth/spreadsheets.readonly')
  })

  it('o cliente de analytics chega no `values.append` do SDK', async () => {
    const { analyticsSheets } = createGoogleClient({ client_email: 'sa@x', private_key: 'k' })
    const params = {
      spreadsheetId: 's',
      range: 'Analytics!A:H',
      valueInputOption: 'RAW' as const,
      insertDataOption: 'INSERT_ROWS' as const,
      requestBody: { values: [['r2', 1]] }
    }
    await analyticsSheets.spreadsheets.values.append(params)
    expect(append).toHaveBeenCalledWith(params)
  })
})
