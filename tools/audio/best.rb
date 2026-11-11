# A new record: a small bright fanfare up C major, ending on a long shimmer.
with_fx :reverb, room: 0.8, mix: 0.4 do
  in_thread do
    synth :hollow, notes: [:c3, :g3, :e4], attack: 0.3, sustain: 1.4, release: 1.8, amp: 0.7
  end
  [[:c5, 0.18], [:e5, 0.18], [:g5, 0.18], [:c6, 0.5]].each do |n, d|
    synth :fm, note: n, divisor: 2, depth: 1.1, attack: 0.005, release: d + 0.3, amp: 0.35
    synth :pluck, note: n, attack: 0, release: d + 0.5, amp: 0.5
    sleep d
  end
  [:g5, :c6, :e6, :g6, :c7].each do |n|
    synth :sine, note: n, attack: 0.005, release: 0.5, amp: 0.09
    sleep 0.07
  end
end
