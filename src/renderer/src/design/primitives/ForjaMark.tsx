import { type JSX } from 'react'

export default function ForjaMark(): JSX.Element {
  return (
    <img
      src="/forja-mark.svg"
      alt="FORJA"
      draggable={false}
      className="absolute right-screen-margin top-11 z-60 w-37.5"
    />
  )
}
