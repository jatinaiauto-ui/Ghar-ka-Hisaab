import { request } from './api.js';
import { monthRange } from '../lib/format.js';

export function fetchCategories() {
  return request('categories?select=*&order=sort.asc');
}

export function fetchMonth(year, month) {
  const { start, end } = monthRange(year, month);
  return request(`expenses?select=*&spent_on=gte.${start}&spent_on=lt.${end}&order=spent_on.desc,created_at.desc`);
}

export function addExpenses(rows) {
  return request('expenses', { method: 'POST', body: rows, prefer: 'return=minimal' });
}

export function deleteExpense(id) {
  return request(`expenses?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function updateExpense(id, fields) {
  return request(`expenses?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
}
