import { createContext, useContext } from 'react'

export interface TopicFilterValue {
  /** Tópico filtrado, ou '' para mostrar tudo. */
  topicId: string
  setTopicId: (id: string) => void
  /** Liga o filtro neste tópico; se já estiver nele, desliga. */
  toggle: (id: string) => void
}

export const TopicFilterContext = createContext<TopicFilterValue>({ topicId: '', setTopicId: () => {}, toggle: () => {} })

/** Filtro global por tópico (ver TopicFilterProvider). */
export function useTopicFilter() {
  return useContext(TopicFilterContext)
}

/** O item passa no filtro? (sem filtro, tudo passa) */
export function inTopic(itemTopicId: string | undefined, filter: string) {
  return !filter || itemTopicId === filter
}
