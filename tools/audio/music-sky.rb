# starswing's loop: "Night climb". 120 bpm, a 64-beat (32 s) loop played
# twice; encode.mjs keeps only the second pass, which already carries the
# first pass's reverb and echo tails, so the seam does not gap. Marker tick
# first; the loop starts one beat (0.5 s) after it.
#
# C major, Cmaj7 - Am7 - Fmaj7 - Gsus4, two bars each, twice through, so
# every note of the climb's tune (C major pentatonic, grab.rb and dust.rb)
# sits inside it. Wide and slow, a sky and not a beat: a pad, a round bass on
# the root, a soft pulse to swing against, and a high bell that only answers
# in the second half. No drums: the player's own catches are the rhythm.
use_bpm 120
use_random_seed 11
sample :elec_tick, amp: 1.4
sleep 1
roots = [:c2, :a1, :f1, :g1]
chords = [chord(:c3, :major7), chord(:a2, :minor7), chord(:f2, :major7), chord(:g2, :sus4)]
arps = [chord(:c5, :add9), chord(:a4, :minor7), chord(:f4, :major7), chord(:g4, :sus4)]
# Pad: one chord per two bars, slow in and out.
in_thread do
  with_fx :reverb, room: 0.95, mix: 0.6 do
    use_synth :hollow
    2.times do
      2.times do
        chords.each do |c|
          play c, attack: 2.5, sustain: 4, release: 3, amp: 0.7
          sleep 8
        end
      end
    end
  end
end
# Bass: the root, once a bar, with its fifth answering.
in_thread do
  with_fx :lpf, cutoff: 70 do
    use_synth :fm
    2.times do
      2.times do
        roots.each do |r|
          2.times do
            play r, divisor: 1, depth: 0.5, attack: 0.02, release: 2.6, amp: 0.5
            sleep 3
            play r + 7, divisor: 1, depth: 0.5, attack: 0.02, release: 0.9, amp: 0.3
            sleep 1
          end
        end
      end
    end
  end
end
# Pulse: soft filtered eighths on the chord's fifth, swelling over each bar.
in_thread do
  with_fx :reverb, room: 0.6, mix: 0.3 do
    with_fx :lpf, cutoff: 85 do
      use_synth :tri
      2.times do
        2.times do
          chords.each do |c|
            16.times do |i|
              play c[2], attack: 0.01, release: 0.22, amp: 0.05 + 0.05 * Math.sin(Math::PI * (i % 8) / 8.0), pan: (i.even? ? -0.4 : 0.4)
              sleep 0.5
            end
          end
        end
      end
    end
  end
end
# Bell: a slow arp, echoed, in the back half of each pass only.
in_thread do
  with_fx :reverb, room: 0.8, mix: 0.5 do
    with_fx :echo, phase: 0.75, decay: 4, mix: 0.3 do
      use_synth :pretty_bell
      2.times do
        2.times do |half|
          arps.each do |c|
            4.times do |i|
              play c[[0, 2, 1, 3][i]] + 12, attack: 0.005, release: 0.9, amp: (half == 0 ? 0.0 : 0.1), pan: (i.even? ? -0.3 : 0.3)
              sleep 2
            end
          end
        end
      end
    end
  end
end
