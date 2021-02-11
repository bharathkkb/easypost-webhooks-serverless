const getValue = (parts: Intl.DateTimeFormatPart[], searchType: string) : string | undefined => {
  return parts.find(p => p.type === searchType)?.value;
}

/**
 * Date in yyyyMMdd with no delimiters.
 */
export const getYyyymmdd = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Toronto'
  } as Intl.DateTimeFormatOptions).formatToParts(date);

  return `${getValue(parts, 'year')}${getValue(parts, 'month')}${getValue(parts, 'day')}`
}