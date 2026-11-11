# 250 m more, and the sky changes colour: a shimmer running up C major
# pentatonic onto a held open fifth.
with_fx :reverb, room: 0.9, mix: 0.5 do
  in_thread do
    synth :hollow, notes: [:c4, :g4, :d5], attack: 0.4, sustain: 0.8, release: 1.6, amp: 0.7
  end
  [:c5, :d5, :e5, :g5, :a5, :c6, :d6, :e6, :g6].each do |n|
    synth :pretty_bell, note: n, attack: 0.003, release: 0.6, amp: 0.3
    sleep 0.07
  end
end
