import { ipcMain } from 'electron'
import { getDb } from '../db/database'

export function registerItemsIpc() {
  ipcMain.handle('items:list', () => {
    return getDb().prepare('SELECT * FROM items').all()
  })

  ipcMain.handle('items:add', (_e, name: string) => {
    getDb().prepare('INSERT INTO items (name) VALUES (?)').run(name)
    return true
  })
}