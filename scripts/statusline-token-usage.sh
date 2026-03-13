#!/bin/bash
input=$(cat)
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
remaining_pct=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')
total_in=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
total_out=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')
output=""
if [ -n "$used_pct" ] && [ -n "$remaining_pct" ]; then
  bar_width=30
  used_chars=$(echo "$used_pct $bar_width" | awk '{printf "%d", ($1 * $2 / 100)}')
  remaining_chars=$((bar_width - used_chars))
  bar=$(printf '%*s' "$used_chars" "" | tr ' ' '#')
  bar="${bar}$(printf '%*s' "$remaining_chars" "" | tr ' ' '-')"
  output="Tokens [${bar}] ${used_pct}% used"
fi
total=$((total_in + total_out))
if [ "$total" -gt 0 ]; then
  [ -n "$output" ] && output="${output} | "
  output="${output}in:${total_in} out:${total_out}"
fi
[ -n "$output" ] && echo "$output" || echo "Tokens: waiting..."
