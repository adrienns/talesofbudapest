export type SearchBarProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onFilterClick?: () => void
  filterAriaLabel?: string
  showFilter?: boolean
}
