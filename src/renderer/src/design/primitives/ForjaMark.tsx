import { type JSX } from 'react'
import { FORJA_MARK_URL } from '../assets'

export default function ForjaMark(): JSX.Element {
  return (
    <img
      src={FORJA_MARK_URL}
      alt="FORJA"
      draggable={false}
      className="absolute right-screen-margin top-11 z-60 w-37.5"
    />
  )
}
