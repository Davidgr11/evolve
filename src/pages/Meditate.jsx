import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../utils/firebase';
import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import {
  ChevronLeft, Loader2, Play, Square,
  CloudRain, Waves, TreePine, Flame, Sparkles, VolumeX, Wind, Droplets,
} from 'lucide-react';
import { callClaude, ttsSpeak } from '../utils/cloudApi';
import toast from '../utils/toast';

// ── Helpers ────────────────────────────────────────────────────────────────────

const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const SOUNDS = [
  { id: 'rain',   label: 'Lluvia',  Icon: CloudRain, from: '#5a7fa0', to: '#8ab0c8' },
  { id: 'ocean',  label: 'Océano',  Icon: Waves,     from: '#1a6080', to: '#3a9aba' },
  { id: 'forest', label: 'Bosque',  Icon: TreePine,  from: '#2a6040', to: '#4a9a68' },
  { id: 'river',  label: 'Río',     Icon: Droplets,  from: '#2e7090', to: '#5aa8c8' },
  { id: 'wind',   label: 'Viento',  Icon: Wind,      from: '#607890', to: '#90aac0' },
  { id: 'fire',   label: 'Fogata',  Icon: Flame,     from: '#a03010', to: '#d86030' },
  { id: 'space',  label: 'Espacio', Icon: Sparkles,  from: '#1a1060', to: '#3a2890' },
  { id: 'none',   label: 'Silencio',Icon: VolumeX,   from: '#4a5060', to: '#7a8090' },
];

const DURATIONS = [
  { mins: 3,  label: '3 min',  secs: 180 },
  { mins: 5,  label: '5 min',  secs: 300 },
  { mins: 10, label: '10 min', secs: 600 },
];

const THEME_GROUPS = [
  {
    id: 'trabajo', label: 'Trabajo', emoji: '💼',
    themes: [
      {
        id: 'stress-work', label: 'Estrés laboral',
        phrases: [
          'Welcome to this space of your own. For a few minutes, work and all its demands can wait. Bring your attention to your breath and allow yourself to be fully here.',
          'Feel the weight in your shoulders and gently allow them to release downward. With each exhale, let go of a little of that muscle tension. Your body knows how to release what it no longer needs to carry.',
          'Your mind worked hard today and deserves this genuine rest. Observe the thoughts that arise and let them pass without holding on to any of them. This is your recovery time.',
          'Each exhale carries away the tension accumulated in your body and mind. Imagine that with each breath your nervous system receives a signal of safety. Slowly, calm replaces activation.',
          'The pending tasks will still be there later, exactly where you left them. This moment is yours alone to recharge and regain clarity. Allow yourself to simply exist here without producing anything.',
          'You are far more than your productivity — your worth does not depend on how much you accomplish in a day. Take a deep breath and let that truth settle into your body. You are enough beyond what you achieve.',
          'Imagine the pressure of work dissolving with each breath you take. Visualize that tension leaving your shoulders, your jaw, your chest. The space that remains is yours to fill with calm.',
          'Your body knows how to recover — it only needs permission to do so right now. Give yourself that permission without conditions or guilt. This pause is not weakness; it is intelligence and self-care.',
          'The problems at work have solutions, and so does your inner peace. From a calm state, answers arrive with more clarity and less effort. Breathe and trust that process.',
          'Observe work thoughts like clouds passing without stopping in the sky. You do not have to follow them or resolve them right now. Your only task here is to breathe and let go.',
          'With each deep breath, your mental clarity is restored and your perspective expands. Rest does not paralyze your effectiveness — it powers and multiplies it. You are investing in your best self.',
          'When this session ends, you will return to work renewed, with greater focus and fresh perspective. Trust that this pause has a real purpose. What awaits you when you leave is worth waiting a few minutes.',
        ],
      },
      {
        id: 'focus-work', label: 'Enfoque y productividad',
        phrases: [
          'Center your attention on this present moment. Everything else — pending tasks, notifications, noise — can wait a few minutes. This is your time to prepare your mind.',
          'Feel how your mind settles and becomes clearer with each breath. Like water that stops being agitated, your clarity emerges on its own when given space. Watch it appear.',
          'Visualize your most important task with all its details and its final result. You see it completed successfully, exactly as you want it to look. Feel the satisfaction of that achievement in your body right now.',
          'Your best work always comes from a calm and focused mental state, never from tension. Pressure does not produce quality — calm does. This pause is an active part of your performance.',
          'Release the thoughts that scatter your energy right now. With each exhale, gently return to your center. Your focus sharpens when you stop forcing it.',
          'The clarity you need is already within you — it only needs space to fully emerge. You do not have to generate it; you just have to stop blocking it. Breathe and allow it to appear.',
          'With each exhale you release accumulated distraction. With each inhale you receive renewed and clean focus. This cycle is your most powerful tool before working deeply.',
          'Your mind is a precise instrument and this pause sharpens it for what comes next. Like a musician who tunes before playing, you tune your attention before creating. The quality of your work starts here.',
          'Visualize the flow of work you want to have today: calm, effective, and with natural momentum. Feel how your energy organizes itself toward that state. You are creating the inner conditions to achieve it.',
          'Deep concentration arrives when the mind is at rest, not when it is in forced tension. You cannot demand focus — you can create the conditions for it to arrive on its own. That is exactly what you are doing now.',
          'When you finish this session, you will carry this calm into everything you do throughout the rest of the day. Every task, every decision will be better from this inner state. This investment of time is already generating returns.',
          'You are ready to give your best today. Your mind and body are aligned, prepared, and at peace. When you leave here, act from that certainty without doubt.',
        ],
      },
      {
        id: 'event-work', label: 'Presentación o reunión',
        phrases: [
          'Take this moment to center yourself deeply before what lies ahead. Feel your feet on the ground and your breath as a firm anchor. Everything you need for this moment you already have within you.',
          'The nerves you feel are energy you can direct completely in your favor. They signal that you care about what you do, that you give your best. Breathe and transform that energy into full presence.',
          'You have prepared this with care and real dedication. Trust what you know, what you have practiced, and who you are as a person. Your preparation is done — now you just have to be yourself.',
          'Visualize yourself in the meeting: calm, clear, present, and connected with the people listening. Imagine your voice confident and your ideas well articulated. That image is already planting the state you want to have.',
          'Your voice is confident and your ideas have real, concrete value. You deserve to be heard with attention and genuine respect. Breathe into that conviction and let it settle in your body before you walk in.',
          'With each deep breath, your nervous system receives the signal that you are safe and prepared. Cortisol decreases, your voice stabilizes, your mind clears. You are recovering your best natural state.',
          'Think of other times you came through challenging or uncomfortable situations. That capacity has not left you — it is still exactly where it always was. You carry that complete track record with you into this presentation.',
          'You do not need to be perfect to have real impact — you just need to be authentic and prepared. People connect with authenticity far more than with any forced perfection. Be yourself and trust that fully.',
          'Success does not require the absence of nerves — it requires knowing how to breathe through them with calm and confidence. The best communicators feel nerves and use them as fuel. You are doing exactly that right now.',
          'Imagine everything going well: fluid, natural, with good connection and clear messages. Feel that genuine satisfaction settle into your body as a real and present sensation. That image is more powerful than you imagine.',
          'You are more ready than you think right now. Your preparation, your experience, and your clear intention support you completely. Trust the process and yourself without reservation.',
          'When you open your eyes, you will carry this calm and this confidence into every moment of the meeting. You can return to this state with a single conscious breath if you need it. You already know how.',
        ],
      },
    ],
  },
  {
    id: 'vida-social', label: 'Vida social', emoji: '👥',
    themes: [
      {
        id: 'conflict', label: 'Conflicto con alguien',
        phrases: [
          'This is your safe space to process what you feel, completely without judgment. Here you can feel everything you need to feel without having to act on it. Give yourself that permission now.',
          'It is completely valid to feel affected by a conflict — that makes you deeply human. You do not have to minimize what you feel in order to move on faster. Breathe and let the emotions exist.',
          'Inhale deeply and give real space for emotions to settle calmly. Like sediment in agitated water, they clarify on their own when you stop stirring them. Your clarity is arriving.',
          'Behind every conflict are unexpressed needs that deserve to be heard. Yours matter as much as the other person\'s. Calmly identify what you truly need.',
          'You do not have to resolve everything now or have immediate answers. You just need to be well yourself first, before anything else. That is not selfishness — it is wisdom.',
          'Bring your attention to your body. Where do you hold the tension of this conflict — your chest, your jaw, your stomach? Breathe gently toward that place with each inhale and release it with each exhale.',
          'True understanding arrives when the mind is calm, not when it is reactive and defensive. From this state of calm, you will see options that were not visible before. Wait for that moment.',
          'You can feel hurt and also consciously choose how you want to respond. That choice is your greatest power in any conflict. Breathe and decide from there, not from the pain.',
          'Let go for now of the urgent need to be right or to resolve everything. Find your inner peace first and clarity will come afterward naturally. The conflict does not disappear, but you face it differently.',
          'With each breath, you create healthy distance between the event and your emotional reaction. That distance is not coldness — it is wisdom and real self-control. From there you can act with more integrity.',
          'Genuine relationships survive conflicts when there is willingness and clarity from both sides. This moment of pause is already an act of care toward the relationship. You are choosing well.',
          'When you leave here, you will have greater clarity, calm, and perspective to face this situation. You will carry not only calm, but also a broader understanding. That is the gift of this pause.',
        ],
      },
      {
        id: 'social-anxiety', label: 'Ansiedad social',
        phrases: [
          'This space is completely yours. Here there is nothing to prove, no one to judge you, no expectation to meet. Just you and your breath.',
          'Social anxiety is an automatic bodily response to a perceived threat, not a truth about who you are. Your body is trying to protect you with excessive zeal. You can thank it and relax it.',
          'Breathe slowly and deeply. Your nervous system is receiving the signal that you are safe right now. Each calm breath teaches your body that it can relax.',
          'You do not have to be liked by everyone or approved of by every person you meet. You just have to be honestly yourself and the right connections will come. That is enough.',
          'Others are much more focused on their own thoughts than you imagine. The attention you feel on yourself exists mainly in your mind. Breathe and release that imaginary burden.',
          'With each breath, you reduce the alarm signal in your central nervous system. Cortisol drops, muscles relax, the mind calms. You are training your body toward peace.',
          'Think of someone with whom you feel completely comfortable and accepted as you are. Feel that warmth in your body for a moment. That same peace is available in many more contexts than you believe.',
          'You have perspectives, ideas, and something valuable to offer the world around you. Your authentic presence truly matters. You do not have to be perfect to deserve space and to be heard.',
          'The social discomfort you feel is a temporary and passing sensation, not a life sentence. This session is helping you move through it with more resources. Each time you do, you become more capable.',
          'Your words have real value. Your unique perspective deserves to be shared without apology. Practice believing that here in the safety of this space before carrying it into the world.',
          'With consistent practice and genuine patience with yourself, social anxiety yields ground little by little. You do not have to resolve it all today. Each conscious breath is already a meaningful step.',
          'When you finish, you will carry a calmer, more grounded, and more confident presence into the world. You will notice small differences. Trust the process and your own progress.',
        ],
      },
      {
        id: 'loneliness', label: 'Soledad',
        phrases: [
          'Being alone does not mean being abandoned or unloved. You are valuable company for yourself. Learn to inhabit that space with gentleness.',
          'Breathe deeply and feel your own heart beating strongly. There is life, warmth, and genuine presence in you. You are never completely alone as long as you are with yourself.',
          'The loneliness you sometimes feel is just the natural space between human connections. It is temporary and known by everyone. It will pass, as it always has.',
          'Give yourself the same gentleness, patience, and care you would unhesitatingly give to a friend who feels lonely. You are just as deserving of that compassion as anyone else. Start with yourself.',
          'Think of a specific person who appreciates and loves you, even if they are far away right now. Feel that real affection as warmth in your chest. That love exists even when you cannot see it in this moment.',
          'Genuine connection can bridge physical distance and time. There are people who think of you even if they do not say it right now. That too is real and present.',
          'Use this stillness as a valuable gift that few allow themselves. There is something in you that only blooms in silence and solitude. Discover it with curiosity and without fear.',
          'Solitude can be a profound invitation to know yourself more genuinely. What do you discover when the external noise fades? Listen to what emerges in this inner space.',
          'Remember specific moments of genuine connection you have lived with people who matter to you. Those moments shaped you and still inhabit you. You carry that richness with you always.',
          'Your presence in the world makes a real difference, even if you do not always perceive it or see it reflected. The people who know you are better for having found you. That is true.',
          'Every time you care for yourself with love and attention, you build the best possible company. You become someone who enjoys your own presence. That changes everything.',
          'You deserve deep connection and you will find it when the moment is right. For now, this inner calm is also a valid and real home. Inhabit it with peace.',
        ],
      },
    ],
  },
  {
    id: 'pareja-familia', label: 'Pareja y familia', emoji: '❤️',
    themes: [
      {
        id: 'couple-conflict', label: 'Discusión de pareja',
        phrases: [
          'Take this necessary space for yourself before continuing the conversation. It is not running away — it is preparing yourself to speak better. This pause is already an act of care toward the relationship.',
          'What you feel has complete validity and deserves to be recognized. And what the other person feels also has its own validity. Two truths can coexist without either negating the other.',
          'Breathe deeply and let reactivity dissolve gently before responding. Words spoken in calm are always more effective and less harmful. Wait for that moment.',
          'A conflict does not define the relationship or its future. It defines how you choose to move through it together and what you learn. This is one of those defining moments.',
          'What do you truly need from this situation — beyond winning or being right? Ask yourself honestly and without judgment. That clarity is the starting point for a real conversation.',
          'With each breath, you create valuable space between the pain you feel and your response. That space is where your best decisions live. Protect it and expand it with each inhale.',
          'Words and actions that come from calm have far more transformative power than those that come from anger. This is not giving in — it is choosing to be more effective. Breathe into that conviction.',
          'Think about what you genuinely value in this person and in this relationship. That love is also real and present, even if it is now covered by conflict. It has not disappeared.',
          'Honest vulnerability often resolves far more than winning any argument. Saying it hurt me or I need this has more power than arguing about who is right. That requires courage.',
          'You do not have to have everything clear or resolved right now. This pause is already an important step forward. When you feel calmer, the right words will come more naturally.',
          'From this calm and grounded state, you can listen with more openness and be heard better. Real communication only happens when both people are present and receptive. You are preparing yourself for that.',
          'When you leave here, carry the genuine intention to understand before seeking to be understood. That attitude completely changes the dynamic of any difficult conversation. It is a gift you give yourself and the relationship.',
        ],
      },
      {
        id: 'family-tension', label: 'Tensión familiar',
        phrases: [
          'Families are complex, contradictory, and also profoundly beautiful. This moment is to find your center before returning to that world. Breathe and anchor your identity.',
          'Breathe and clearly separate what you can control from what is beyond your reach. Focus your energy only on the former. Letting go of the latter is not surrender — it is wisdom.',
          'You do not have to resolve the entire family dynamic today or carry the weight of every problem. You just need to be well yourself as the condition for anything else. That is enough.',
          'The family burden is real and can be very heavy at certain moments. But not all of it belongs to you to carry alone. Learn to distinguish what is your part and what is not.',
          'Each breath returns you to yourself, outside the roles and expectations you play in family. For a moment, you are just yourself without any title. Feel that genuine freedom.',
          'Think of a specific moment of genuine love and real connection with your family. That also exists and is as real as the tension. Both coexist in the same story.',
          'You can love your family deeply and also set healthy and necessary boundaries. They are not opposites — they complement each other. Healthy boundaries are a form of love, not a betrayal.',
          'The strongest tree has deep roots that sustain it without limiting it. Your family roots give you context and strength, not just restrictions. You can honor them and also grow beyond them.',
          'With each exhale, you consciously release the expectations that belong to others, not to you. You do not have to meet them all to be enough. Choose what to carry and what to release with freedom.',
          'Your personal well-being is also a real gift to your family, even if they do not always see or acknowledge it. When you are well, you have more to give. Taking care of yourself is also caring for them.',
          'From this state of calm and integrity, your words will have more positive and lasting impact. Difficult conversations resolve better from here. It is worth arriving at that state.',
          'You carry love within you that is greater than any tension you are living through right now. That love survives the difficult moments. Trust it as the foundation of everything that comes.',
        ],
      },
      {
        id: 'disconnection', label: 'Desconexión emocional',
        phrases: [
          'Sometimes we lose ourselves in the noise and demands of daily life. It is not your fault — it is the consequence of living very fast and very outward. This session is your return.',
          'This session is a gentle invitation to reconnect with yourself, without rush or expectations. You do not need to arrive anywhere in particular. Just be here with yourself.',
          'Feel your breath moving gently through your body. That constant movement is you, alive and present. You have never completely gone — you have only drifted a little.',
          'When was the last time you asked yourself how you are truly doing, with honesty and genuine care? Not what you produce or accomplish — how are you, right now. Take that time now.',
          'Beneath the fatigue, distraction, and noise, there is something of yours waiting to be heard with patience. That something has important messages for you. This stillness is the language it speaks.',
          'With each inhale you move closer to yourself. With each exhale you release the accumulated distance. It is a journey of return that you can take whenever you choose.',
          'You do not need to understand or categorize everything you feel to validate it. You just need to feel it without judging or rejecting it. That alone is reconnection.',
          'Your body holds a deep wisdom that the rational mind does not always grasp. This stillness is the language in which that wisdom speaks. Listen with curiosity.',
          'Genuine reconnection begins with this precise moment, with this breath you are taking right now. Nothing more is needed to begin. You are on your way.',
          'You are much more than your responsibilities, social roles, and daily obligations. There is a whole being beneath all of that. This pause lets you remember it.',
          'Give yourself real permission to exist here without agenda, without producing anything, just being. Do not justify this time — simply take it as yours. You deserve it.',
          'When you finish, you will carry a spark of reconnection with you into the world. Small but real and valuable. That spark can kindle more if you tend to it.',
        ],
      },
    ],
  },
  {
    id: 'trafico', label: 'Tráfico y traslados', emoji: '🚗',
    themes: [
      {
        id: 'traffic', label: 'Estrés en el tráfico',
        phrases: [
          'Traffic is outside of you and beyond your control. This inner space is completely yours and no one can take it from you. Breathe and remember that.',
          'You cannot control traffic or when it will move. But you can choose how you breathe and what you feel in this moment. That choice is all the power you need.',
          'Consciously release your jaw, your shoulders, and the hands gripping the wheel. Feel that tension yield simply by noticing it. Breathe toward those places.',
          'Each pause in traffic is actually an invitation to take a deep, conscious breath. You are turning lost time into recovery time. That changes everything.',
          'The destination will arrive exactly when it is meant to. The journey does not have to be unnecessary suffering. Choose how you want to live it.',
          'Your time is not lost in traffic — that is inevitable. Your peace, however, is only lost if you choose to give it away. Reclaim it with each conscious breath.',
          'Breathe deeply and remember that this, like everything in life, is completely temporary. This moment of traffic will pass. What you build within yourself while waiting, remains.',
          'Every meter you advance is one real meter closer to where you are going. There is progress, even if it is slow and irregular. Your direction has not changed.',
          'With each slow, deep breath, you reduce cortisol in your blood and tension in your muscles. Your body responds immediately to this care. You are taking care of yourself while you wait.',
          'Think of something concrete and good that awaits you when you arrive — a person, a meal, your own space. Feel that something like a magnet drawing you calmly forward. It is coming.',
          'You are larger and more capable than this moment of impatience and discomfort. Your calm is a real choice you can make right now. That is your victory.',
          'You will arrive — that is inevitable. And when you do, you can arrive in peace if you choose to breathe now instead of tensing up. You will feel that difference when you step out of the car.',
        ],
      },
      {
        id: 'transition', label: 'Entre actividades',
        phrases: [
          'You finished one thing and are moving toward another. This space between them is your moment of conscious transition. Use it with intention.',
          'Let go of what came before before you arrive mentally at what comes next. You do not have to carry the energy of one activity into the next. You can choose to arrive clean.',
          'Your mind still carries the energy residue of what just happened — thoughts, emotions, tensions. This breath helps you release them completely. You are doing a reset.',
          'With each exhale you intentionally release what has passed. With each inhale you receive openness and freshness for what comes. This is the cycle of a conscious life.',
          'You do not have to arrive at the next place or the next person carrying all the weight of what just happened. You can choose to begin each thing anew, from zero. That choice is yours.',
          'This pause between activities is not lost time. It makes you more effective, more present, and calmer in what follows. It is an investment that generates immediate return.',
          'Imagine your mind is a whiteboard. Each deep breath clears it a little more. When this session ends, it will be ready to receive the new with clarity.',
          'You arrive wherever you are going as the best version of yourself available. That is the only responsibility you have in each transition. Bring yourself, in calm.',
          'The best transitions are the ones done consciously, with intention and presence. You have that opportunity right now. Do not let it pass.',
          'Your full presence in what comes next is the greatest gift you can give that next activity and the people waiting for you. This pause makes it possible.',
          'Release the past with real gratitude for what it was. Receive the present with genuine openness. That is the practice of living well.',
          'You are ready for what comes. This pause was the bridge between what was and what will be. You crossed it well.',
        ],
      },
      {
        id: 'arriving-home', label: 'Llegada a casa',
        phrases: [
          'You made it home. The outside day and everything it brought can stay outside tonight. Something different begins here.',
          'This space is your home and it deserves your full presence, not just your exhausted body. Allow yourself to truly enter it, in every sense.',
          'Feel how your body instinctively recognizes the safety and familiar feeling of being home. That relaxation emerging — give it permission to expand.',
          'With each breath, you gradually release work mode and its tensions. And you gradually recover life mode and its textures. It is a shift you can make consciously.',
          'The people waiting for you deserve your real presence, not just your body present in the space. This pause is the gift you give them before you walk in. And that you give yourself.',
          'Before crossing the door, make this transition from the inside where it truly matters. One minute here can completely change how the evening at home unfolds. It is worth the time.',
          'The stress of the day does not have to come in with you or infect your space. It can stay symbolically at the threshold, outside. Decide that it will.',
          'Think of something small and specific that makes your home special and yours. A person, a corner, a smell, a routine. Smile inwardly toward that.',
          'With each exhale, you release the character you play at work and all its masks. And you recover who you are at home, with family. That person is also valid and deserves space.',
          'Your family, your space, your people — they are waiting for you. Arrive to them whole and present, not halfway. That is what they need most from you.',
          'The best thing you can bring home is not anything material — it is your calm, your presence, and your openness. That cannot be bought. It is cultivated, as you are doing now.',
          'Welcome back to yourself and to what matters most. The true home always begins within. You are already there.',
        ],
      },
    ],
  },
  {
    id: 'emociones', label: 'Emociones difíciles', emoji: '🌊',
    themes: [
      {
        id: 'sadness', label: 'Tristeza',
        phrases: [
          'It is completely valid to feel sadness and you do not have to fight against it or rush it. Let it be with you as a visitor, not an enemy. Breathing together already helps.',
          'Allow the sadness to be with you in this moment without settling in permanently or defining you. It can exist here and also pass. Both things are true.',
          'Breathe gently and give generous space to what you feel without labeling or judging it. Just observe with the same gentleness you would give to someone you love. That gentleness is for you too.',
          'Sadness is a sign that something or someone matters deeply to you. That is not weakness — it is deeply human and beautiful. Only those who love feel this.',
          'You are not broken. You are processing something difficult and that requires time and space. There is an enormous difference between being broken and being in the process of healing.',
          'With each deep breath, you generate a small space of relief within yourself. That space does not erase the sadness — it coexists with it. And in that space you can breathe.',
          'Feelings, even the heaviest and darkest ones, are temporary and passing. No emotion lasts forever, even if it seems that way in the moment. This one will pass too.',
          'Give yourself the same real compassion you would give without thinking to a friend going through the same thing. Without conditions, without rush, without judgment. That is what you deserve right now.',
          'There is light in you even when you cannot feel it or see it. What you feel right now is not all that you are, nor does it define what you will be. It is a passing moment in a much larger story.',
          'You do not have to understand why you feel this way or find the logical cause. You just have to move through it with gentleness and presence. Understanding will come later, on its own.',
          'Each deep breath activates your parasympathetic nervous system — the one that calms and heals. Your body is already responding and helping. Trust that natural process.',
          'When you finish, you will carry a little more lightness with you. The sadness will gradually yield space. Not all of it today, but something. And that counts.',
        ],
      },
      {
        id: 'anger', label: 'Ira o frustración',
        phrases: [
          'You are feeling something very intense right now and that is okay. This space is completely safe for you and for what you feel. You do not have to control it right now.',
          'Anger is powerful energy. Now we direct it inward to understand it, not outward to destroy. That redirection is your strength.',
          'Breathe deeply and slowly, slower than normal. Your nervous system needs this clear signal of calm to exit alarm mode. Each breath counts.',
          'Behind every genuine anger there is an unmet need that is calling out to be addressed. What is yours right now? Identify it honestly and without judging yourself.',
          'You can feel anger fully without it controlling or defining you. Feeling is not acting. You can be furious and still choose how to respond. That is your freedom.',
          'With each exhale, you release accumulated pressure like a valve that opens gently and with control. It is not an explosion — it is conscious and gradual release. Your pace.',
          'The response that emerges from calm has infinitely more transformative power than the one born from rage. This is not giving in — it is becoming more effective. Wait for that state.',
          'Observe the anger without identifying with it. You are the observer of that emotion, not the emotion itself. From that perspective you have much more power and clarity.',
          'When anger passes, something softer usually remains beneath it — pain, fear, frustration. Allow that softer thing to emerge. That is where the real answers are.',
          'Your well-being and inner peace are more valuable than winning any argument or being right. That clarity of priorities is wisdom in action. Breathe into it.',
          'Each deep breath reduces active cortisol in your blood and tension in your muscles. Your body is already healing and regulating itself. Help it with one more breath.',
          'When you leave here, you will be able to respond from clarity instead of reacting from pain. That difference completely changes the outcome. Every second of this pause is worth it.',
        ],
      },
      {
        id: 'fear', label: 'Miedo o incertidumbre',
        phrases: [
          'The fear you feel is real and has reason to exist. So is your capacity to move through it without it destroying you. Both things are true at the same time.',
          'Breathe and anchor your full attention in this present moment. Here, right now, you are safe. Fear lives in the future — you live in this instant.',
          'You cannot control how the uncertain future will unfold. But you can be well in this precise instant. That is all that is asked of you right now.',
          'Your mind is generating possible and probable scenarios. Gently bring your attention back to your breath. It is your anchor to the only moment that exists: this one.',
          'You have moved through difficult and uncertain moments before and you came through. You carry that learning and that capacity with you now. Your track record speaks for you.',
          'Uncertainty is a permanent condition of human life, not an error or a failure. Your capacity to adapt and move forward is too. They are companions.',
          'With each slow, deep breath, you activate your parasympathetic nervous system — the system of calm. Your body responds immediately. You are changing your physiological state.',
          'You do not need to know how everything will turn out in order to be well in this moment. Peace does not depend on certainty. It can exist within uncertainty.',
          'Fear of the future exists in your mind as an imagined scenario. Your body, however, only exists in this present moment. Return to it with your breath.',
          'Trust the future version of yourself that will already know what to do with whatever comes. That version exists and is being formed by how you move through this moment. You are growing.',
          'You are more resilient than you believe in this moment of fear. Your story proves it on every page. Trust that concrete evidence.',
          'When you leave here, you will carry more calm, more confidence, and more faith in your ability to move forward. Not certainty about the outcome, but trust in yourself. That is more valuable.',
        ],
      },
    ],
  },
  {
    id: 'bienestar', label: 'Bienestar diario', emoji: '☀️',
    themes: [
      {
        id: 'morning', label: 'Inicio del día',
        phrases: [
          'Good morning. This is the first moment of a new day that is entirely yours. Before the world asks anything of you, this space belongs to you.',
          'Before the world calls on you and the schedule begins, take this real time for yourself. It is the most important gift you can give yourself each morning. Begin from within.',
          'Feel how your body awakens gradually with each conscious breath you take. Muscles lengthen, the mind clarifies, energy emerges. Observe that process.',
          'Today is a real and complete new opportunity. What happened yesterday stayed in the past where it belongs. You have a new page waiting.',
          'How do you want to feel today? Establish that clear and specific intention now. Not what you have to do — how you want to be while doing it.',
          'Your body and mind are preparing together for the day. Help them with calm, with presence, and with gratitude. This preparation makes a difference.',
          'Think of one small, concrete thing you want to genuinely enjoy today. A coffee, a conversation, a moment of sunlight. That is also the day.',
          'You do not need to have everything planned or controlled to begin with strength. You just need to begin with presence and intention. The rest will order itself.',
          'This moment of stillness at the start of the day is a powerful gift you are giving yourself. Conscious mornings change the day. You are doing something real.',
          'You carry with you everything you need for the day that begins. The ability, the experience, the intention. It is more than you think.',
          'Breathe deeply and fill your body with the quiet, focused energy you need. Every cell receives that oxygen. Your day starts from the inside out.',
          'Welcome to your day. Begin from the inside out, from calm toward action. From this moment of stillness toward everything that comes.',
        ],
      },
      {
        id: 'evening', label: 'Cierre del día',
        phrases: [
          'The day is ending and it is time to consciously release everything it was. The good that was, with gratitude. The difficult that was, with gentleness. Both deserve that closure.',
          'Review the day mentally without judging or grading it. Just observe what happened as a compassionate witness. There is no grade to give — there is releasing to do.',
          'What went well today, large or small? Give it the genuine recognition it deserves before letting it go. Acknowledging the good is not vanity — it is honesty.',
          'What was difficult or painful today? Release it with gentleness and without drama. You did what you could with the resources you had. That was enough.',
          'Your body carried many things today — physical, emotional, mental. Thank it for everything it held without complaining. And allow it to truly rest now.',
          'With each exhale, you consciously deposit the weight of the day somewhere that is not your body. Tomorrow you can pick it up if you need it. Tonight, rest.',
          'Tomorrow there will be another opportunity for what remained unfinished or unresolved. Tonight is for resting, not for resolving. Set limits on your work thoughts.',
          'Remember someone who brightened your day today, even with something small. A smile, a word, a gesture. That moment also existed and deserves recognition.',
          'You are safe in this moment. The day is over and there is nothing more to resolve right now. You can release constant vigilance and truly rest.',
          'Your mind deserves to rest as much as your body after a long day. Let go of the pending items until tomorrow, when you will be more rested. You do not resolve them now anyway.',
          'What was not resolved today can patiently wait until tomorrow when you have more energy. You cannot wait for the rest your body needs. Prioritize well.',
          'Close this day with genuine gratitude for what it was. You did what you could with what you had. It was enough. That is always enough.',
        ],
      },
      {
        id: 'gratitude', label: 'Gratitud',
        phrases: [
          'Stop for a real moment and observe what you have with clarity, not what you lack. The balance between both gives you perspective. Begin with what is here.',
          'Think of a specific person who brought light, warmth, or joy to your life today, even with something small. Feel gratitude for their existence in your story.',
          'Your body breathes, beats, and moves in this moment without you having to ask it to. That is an extraordinary and everyday gift that many cannot take for granted. Be grateful for it.',
          'There is something in your life that you take completely for granted and that someone else would wish to have. What is it? Name it internally and feel the real weight of that gift.',
          'Gratitude does not deny pain or erase what has been difficult. It just makes space for what is also good and true. Both can coexist honestly.',
          'With each inhale, you receive the gift of air, oxygen, and life. With each exhale, you give thanks and return it. It is the most basic and most sacred cycle.',
          'Think of something in nature that you genuinely like — the sun, the sky, rain, the wind. All of it exists and is freely available to you. Nothing charges you for it.',
          'There are people in your life who love you genuinely. Feel that real warmth in your chest for a moment, even if they are far away. That love exists right now.',
          'Gratitude transforms the ordinary into enough and the enough into abundance. It is one of the most powerful practices that exist for changing the perception of reality.',
          'When you leave here, carry this grateful gaze into the rest of the day and into the people you encounter. The world looks different from gratitude. Try it.',
          'Your story, with all its difficulties, scars, and mistakes, has formed you into who you are today. That too deserves genuine gratitude. Nothing was in vain.',
          'You are enough. You have enough. In this precise moment, there is peace available for you. Everything you need is here.',
        ],
      },
    ],
  },
  {
    id: 'salud', label: 'Salud y cuerpo', emoji: '🌿',
    themes: [
      {
        id: 'health-anxiety', label: 'Ansiedad por salud',
        phrases: [
          'Your body is deeply wise. It has overcome difficult things before and knows how to care for itself with the resources it has. Trust that innate intelligence.',
          'Health anxiety amplifies the normal signals of the body and turns them into threats. This breath calms the alarm system. You are changing the signal.',
          'Breathe deeply and consciously, bringing oxygen and calm to every part of your body. Feel that oxygen arriving even to the places where you feel tension.',
          'You do not need absolute certainty about everything to be well in this present moment. Certainty is not a condition for peace. Peace can exist with uncertainty.',
          'Excessive worry does not protect your health or prevent anything — but inner peace actively supports healing systems. You are choosing what works.',
          'With each breath, you activate the parasympathetic nervous system — the one that heals, regenerates, and rests. Not the one that alarms. You are using your body in favor of your well-being.',
          'Your body and you are completely on the same side. You are not adversaries — you are partners. Work with it, not against it, and you will notice the difference.',
          'Let go for a few minutes of the negative scenarios your mind generates. There is only this breath, this moment, this body functioning right now. Return to that.',
          'The catastrophizing mind is not objective reality — it is a modifiable thinking habit. Return to the present where your body, right now, is here and functioning.',
          'Be grateful for what your body does well today — every function, every movement, every sense. There is much if you look honestly. More than anxiety lets you see.',
          'You are doing the right thing by taking care of yourself and paying attention. Excessive worry does not help — this kind of conscious care genuinely does. Stay here.',
          'When you finish, carry a kinder, more collaborative, and less anxious relationship with your body. It is your ally. Treat it as such.',
        ],
      },
      {
        id: 'fatigue', label: 'Cansancio o agotamiento',
        phrases: [
          'Your body asked clearly for a pause and you listened to that signal. This session is exactly what you need right now. Well done for being here.',
          'You do not have to do anything else in this moment. Not produce, not solve, not respond to anything. Just breathe. That is all that is asked of you.',
          'The tiredness you feel is real, legitimate, and deserves to be acknowledged honestly. Do not minimize it or ignore it. It is a signal that you give a lot. Attend to it.',
          'With each deep breath, you bring renewing oxygen to every cell in your body that needs it. Feel that immediate relief moving through your tissues. Your body appreciates every breath.',
          'Rest is not giving up or failing. It is intelligently recharging to be able to continue better and farther. Athletes know this. Now you do too.',
          'Imagine that with each slow exhale, you expel the accumulated tiredness you carry in your body. With each inhale, you receive renewed energy. That real exchange is happening.',
          'Your body has an extraordinary capacity to recover when given adequate space. Give it that space now, without rush and without conditions. Watch how it responds.',
          'Not everything has to be done today and not everything can wait indefinitely. Learn to distinguish. Some things genuinely can wait for your renewed energy.',
          'Feel the real support of whatever is holding you physically right now. Release yourself completely into that surface. You do not have to hold your own weight right now.',
          'Rest is also deeply productive — the best creators, athletes, and thinkers know and practice this. It is not lost time. It is direct investment.',
          'You deserve to restore yourself completely. Not as an occasional luxury, but as a fundamental need of any human being who gives a lot. Claim that right now.',
          'When you finish, you will have a little more energy and clarity for what truly matters. Not everything, but something more. And that something more changes how the rest of the day looks.',
        ],
      },
      {
        id: 'pain', label: 'Dolor o tensión física',
        phrases: [
          'Your body speaks to you through pain and tension. Listen to it with gentleness and without resistance. That listening is already part of healing.',
          'Consciously bring your breath toward the specific place where you feel tension or discomfort. Imagine the air arriving directly to that area. Notice what happens.',
          'You do not have to fight against pain for it to diminish. Sometimes simply observing it calmly and without resistance transforms it. Try it with curiosity.',
          'With each deep inhale, you bring warmth, oxygen, and relief to that specific area of your body. Imagine a warm light expanding toward that place with each breath.',
          'Imagine your breath is a gentle, constant wave that softly massages that tension from within. Soft, without forcing. With each cycle, something yields a little.',
          'The nervous system and pain are deeply connected. What calms the nervous system reduces the perception of pain. This practice directly helps both.',
          'You are not your pain and you are not defined by it. You are the compassionate observer of that sensation. From that perspective you have more distance and more peace.',
          'With each conscious exhale, you release a small fraction of that accumulated tension. You do not have to release it all at once. Little by little, breath by breath.',
          'Your body deserves genuine care, gentle attention, and real kindness, not judgment or impatience. Treat it as you would treat someone who is suffering and needs compassion.',
          'This conscious pause is already real medicine for your nervous system and for the perception of pain. You are not waiting — you are acting. This counts.',
          'There are healing resources within you that are specifically activated by calm and deep breathing. You are accessing them right now. Trust that process.',
          'When you finish, you will carry a more compassionate, more patient, and kinder relationship with your body. That relationship directly affects how you experience pain. It is worth cultivating.',
        ],
      },
    ],
  },
];

const COMPLETION_QUOTES = [
  'Peace is not something you find outside. It is something you build within.',
  'Every time you stop to breathe consciously, you choose yourself.',
  'Meditating is not emptying the mind. It is learning to observe it with compassion.',
  'You are more than your thoughts. You are the space where thoughts occur.',
  'Stillness is not the absence of life. It is life at its fullest.',
  'Each conscious breath is an act of love toward yourself.',
  'It does not matter how long it lasted. What matters is that you chose it.',
  'When you care for yourself, you have more to give to others.',
  'The resting mind creates more than the mind that never stops.',
  'Today you proved that you can pause. That is a lot in a world that never stops.',
  'Well-being is not a destination. It is the direction in which you walk.',
  'Your breath will accompany you all your life. It is worth knowing it well.',
  'Just as you care for your body with exercise, you care for your mind with meditation.',
  'The calm you feel right now will always be available to you.',
  'You do not have to earn rest. You need it, and that is enough.',
  'In the silence you found something that noise cannot give you.',
  'Today you planted a seed of awareness. With time, it will grow.',
  'Each session makes you more skilled at returning to yourself.',
  'The path outward always begins inward.',
  'Your well-being is the foundation of everything else you build.',
];

// ── Phrase selection ───────────────────────────────────────────────────────────

const selectPhrases = (phrases, durationMins) => {
  const count = durationMins <= 3 ? 4 : durationMins <= 5 ? 7 : 12;
  if (phrases.length <= count) return phrases;
  const step = (phrases.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => phrases[Math.round(i * step)]);
};

const phraseTimes = (totalSecs, count) => {
  if (!count) return [];
  const a = Math.floor(totalSecs * 0.08);
  const b = Math.floor(totalSecs * 0.88);
  if (count === 1) return [a];
  return Array.from({ length: count }, (_, i) => Math.floor(a + i * (b - a) / (count - 1)));
};

const findTheme = (id) => {
  for (const g of THEME_GROUPS) {
    const t = g.themes.find(t => t.id === id);
    if (t) return t;
  }
  return null;
};

// ── Audio synthesis ────────────────────────────────────────────────────────────

const buildNoiseBuf = (ctx, pink = false) => {
  const sr = ctx.sampleRate, len = sr * 5;
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) {
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
        b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362)/8; b6=w*0.115926;
      } else { d[i] = w; }
    }
  }
  return buf;
};

const makeSource = (ctx, pink = false) => {
  const src = ctx.createBufferSource();
  src.buffer = buildNoiseBuf(ctx, pink);
  src.loop = true;
  return src;
};

const startAmbient = (type, ctx) => {
  if (type === 'none') return null;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.setTargetAtTime(0.35, ctx.currentTime, 2);
  const nodes = [];

  const addLFO = (rate, depth, targetParam) => {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = rate; lg.gain.value = depth;
    lfo.connect(lg); lg.connect(targetParam);
    lfo.start(); nodes.push(lfo, lg);
  };

  switch (type) {
    case 'rain': {
      const src = makeSource(ctx, false);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=380; bp.Q.value=1.8;
      const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=200;
      const src2 = makeSource(ctx, false);
      const bp2 = ctx.createBiquadFilter(); bp2.type='bandpass'; bp2.frequency.value=700; bp2.Q.value=3;
      const g2 = ctx.createGain(); g2.gain.value=0.15;
      src.connect(bp); bp.connect(hp); hp.connect(master);
      src2.connect(bp2); bp2.connect(g2); g2.connect(master);
      addLFO(1.8, 0.06, master.gain);
      src.start(); src2.start(); nodes.push(src, bp, hp, src2, bp2, g2);
      break;
    }
    case 'ocean': {
      const src = makeSource(ctx, true);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=500;
      addLFO(0.08, 0.22, master.gain);
      addLFO(0.13, 0.1, master.gain);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp);
      break;
    }
    case 'forest': {
      const src = makeSource(ctx, true);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=750; bp.Q.value=0.6;
      master.gain.setTargetAtTime(0.14, ctx.currentTime, 2);
      addLFO(0.3, 0.04, master.gain);
      src.connect(bp); bp.connect(master); src.start(); nodes.push(src, bp);
      break;
    }
    case 'river': {
      const src = makeSource(ctx, true);
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=600; bp.Q.value=1.2;
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1200;
      addLFO(0.6, 0.08, master.gain);
      addLFO(1.1, 0.05, master.gain);
      src.connect(bp); bp.connect(lp); lp.connect(master); src.start(); nodes.push(src, bp, lp);
      break;
    }
    case 'wind': {
      const src = makeSource(ctx, true);
      const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=400;
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2000;
      master.gain.setTargetAtTime(0.2, ctx.currentTime, 2);
      addLFO(0.15, 0.18, master.gain);
      addLFO(0.4, 0.06, master.gain);
      src.connect(hp); hp.connect(lp); lp.connect(master); src.start(); nodes.push(src, hp, lp);
      break;
    }
    case 'fire': {
      const src = makeSource(ctx, false);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=220;
      const lfo = ctx.createOscillator(); const lg = ctx.createGain();
      lfo.type='sawtooth'; lfo.frequency.value=3.8; lg.gain.value=0.07;
      lfo.connect(lg); lg.connect(master.gain); lfo.start();
      master.gain.setTargetAtTime(0.22, ctx.currentTime, 2);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp, lfo, lg);
      break;
    }
    case 'space': {
      const src = makeSource(ctx, true);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=100;
      const osc = ctx.createOscillator(); const og = ctx.createGain();
      osc.type='sine'; osc.frequency.value=50; og.gain.value=0.06;
      osc.connect(og); og.connect(master); osc.start();
      master.gain.setTargetAtTime(0.18, ctx.currentTime, 2);
      src.connect(lp); lp.connect(master); src.start(); nodes.push(src, lp, osc, og);
      break;
    }
    default: break;
  }

  return {
    fadeOut: () => {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
      setTimeout(() => {
        nodes.forEach(n => { try { if (n.stop) n.stop(); n.disconnect(); } catch {} });
        try { master.disconnect(); } catch {}
      }, 2800);
    },
  };
};

// ── TTS ────────────────────────────────────────────────────────────────────────

const speakWebSpeech = (text, onEnd) => {
  if (!window.speechSynthesis) { onEnd?.(); return null; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'es-ES'; utt.rate = 0.78; utt.pitch = 0.92; utt.volume = 1;
  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith('es') && v.localService) || voices.find(v => v.lang.startsWith('es'));
    if (v) utt.voice = v;
    if (onEnd) utt.onend = onEnd;
    window.speechSynthesis.speak(utt);
  };
  if (window.speechSynthesis.getVoices().length) trySpeak();
  else window.speechSynthesis.onvoiceschanged = trySpeak;
  return utt;
};

const decodeBase64Audio = async (ctx, base64) => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return ctx.decodeAudioData(bytes.buffer);
};

const playAudioBuffer = (ctx, buffer, onEnd) => {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain(); g.gain.value = 1.0;
  src.connect(g); g.connect(ctx.destination);
  if (onEnd) src.onended = onEnd;
  src.start();
  return src;
};

// ── Breathing ──────────────────────────────────────────────────────────────────

const BREATH = [
  { label: 'Inhala',   secs: 4, scale: 1.38 },
  { label: 'Mantén',   secs: 2, scale: 1.38 },
  { label: 'Exhala',   secs: 4, scale: 1.0  },
  { label: 'Descansa', secs: 2, scale: 1.0  },
];
const BREATH_CYCLE = BREATH.reduce((s, b) => s + b.secs, 0);

const getBreathStep = (elapsed) => {
  const pos = elapsed % BREATH_CYCLE;
  let acc = 0;
  for (const step of BREATH) { acc += step.secs; if (pos < acc) return step; }
  return BREATH[0];
};

// ── Component ──────────────────────────────────────────────────────────────────

const RING_R    = 16;
const RING_CIRC = 2 * Math.PI * RING_R;

const Meditate = () => {
  const { user } = useAuth();

  // step: 'setup' | 'session' | 'complete'
  const [step, setStep]               = useState('setup');
  const [showThemes, setShowThemes]    = useState(false);
  const [themeMode, setThemeMode]      = useState('preset'); // 'preset' | 'custom'
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [sound, setSound]             = useState('rain');
  const [duration, setDuration]       = useState(DURATIONS[1]);
  const [themeId, setThemeId]         = useState(null);
  const [customText, setCustomText]   = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [previewId, setPreviewId]     = useState(null);
  const [previewProgress, setPreviewProgress] = useState(0);

  const [todayCount, setTodayCount]   = useState(0);

  const [elapsed, setElapsed]         = useState(0);
  const [totalSecs, setTotalSecs]     = useState(0);
  const [phrase, setPhrase]           = useState('');
  const [phraseOn, setPhraseOn]       = useState(false);
  const [completionQuote, setCompletionQuote] = useState('');
  const [completedMeta, setCompletedMeta]     = useState(null);

  const audioCtxRef     = useRef(null);
  const ambientRef      = useRef(null);
  const previewCtxRef   = useRef(null);
  const previewRef      = useRef(null);
  const previewTimerRef = useRef(null);
  const previewProgRef  = useRef(null);
  const intervalRef     = useRef(null);
  const phrasesRef      = useRef([]);
  const timesRef        = useRef([]);
  const spokenRef       = useRef(new Set());
  const audioBuffsRef   = useRef([]);
  const ttsSrcRef       = useRef(null);

  const breathStep = step === 'session' ? getBreathStep(elapsed) : BREATH[0];

  useEffect(() => {
    if (!user) return;
    const todayStr = toLocalDateStr(new Date());
    getDoc(doc(db, `users/${user.uid}/wellbeing`, 'data')).then(snap => {
      if (snap.exists()) setTodayCount((snap.data().meditations?.[todayStr] || []).length);
    });
  }, [user]);

  // ── Sound preview ──
  const startPreview = useCallback((id) => {
    if (previewRef.current) { previewRef.current.fadeOut(); previewRef.current = null; }
    if (previewCtxRef.current) { setTimeout(() => { try { previewCtxRef.current?.close(); } catch {} previewCtxRef.current = null; }, 3000); }
    clearInterval(previewProgRef.current);
    clearTimeout(previewTimerRef.current);

    if (id === 'none') { setPreviewId(null); setPreviewProgress(0); return; }

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    previewCtxRef.current = ctx;
    previewRef.current = startAmbient(id, ctx);
    setPreviewId(id);
    setPreviewProgress(0);

    let prog = 0;
    previewProgRef.current = setInterval(() => {
      prog += 1;
      setPreviewProgress(prog);
      if (prog >= 100) clearInterval(previewProgRef.current);
    }, 50);

    previewTimerRef.current = setTimeout(() => {
      previewRef.current?.fadeOut(); previewRef.current = null;
      setTimeout(() => { try { ctx.close(); } catch {} previewCtxRef.current = null; }, 3000);
      clearInterval(previewProgRef.current);
      setPreviewId(null);
      setPreviewProgress(0);
    }, 5000);
  }, []);

  const stopPreview = useCallback(() => {
    previewRef.current?.fadeOut(); previewRef.current = null;
    setTimeout(() => { try { previewCtxRef.current?.close(); } catch {} previewCtxRef.current = null; }, 3000);
    clearInterval(previewProgRef.current);
    clearTimeout(previewTimerRef.current);
    setPreviewId(null);
    setPreviewProgress(0);
  }, []);

  // ── Show phrase ──
  const showPhrase = useCallback((text, buffer, ctx) => {
    if (ttsSrcRef.current) { try { ttsSrcRef.current.stop(); } catch {} ttsSrcRef.current = null; }
    setPhraseOn(false);
    setTimeout(() => {
      setPhrase(text);
      setPhraseOn(true);
      const onEnd = () => setTimeout(() => setPhraseOn(false), 1800);
      if (buffer && ctx) {
        ttsSrcRef.current = playAudioBuffer(ctx, buffer, onEnd);
      } else {
        speakWebSpeech(text, onEnd);
      }
    }, 350);
  }, []);

  // ── Stop session ──
  const stopSession = useCallback((completed = false) => {
    clearInterval(intervalRef.current);
    window.speechSynthesis?.cancel();
    if (ttsSrcRef.current) { try { ttsSrcRef.current.stop(); } catch {} ttsSrcRef.current = null; }
    ambientRef.current?.fadeOut(); ambientRef.current = null;
    if (audioCtxRef.current) {
      setTimeout(() => { try { audioCtxRef.current?.close(); } catch {} audioCtxRef.current = null; }, 3200);
    }
    if (!completed) {
      setStep('setup'); setShowThemes(false); setElapsed(0); setPhrase(''); setPhraseOn(false);
      spokenRef.current = new Set(); audioBuffsRef.current = [];
    }
  }, []);

  // ── Save meditation (only on natural completion) ──
  const saveMeditation = useCallback(async (themeLabel, durationMins, tid) => {
    if (!user) return;
    const todayStr = toLocalDateStr(new Date());
    try {
      const ref = doc(db, `users/${user.uid}/wellbeing`, 'data');
      const snap = await getDoc(ref);
      const existing = snap.exists() ? (snap.data().meditations || {}) : {};
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cleaned = Object.fromEntries(
        Object.entries(existing).filter(([d]) => new Date(d) >= cutoff)
      );
      const todayMeds = cleaned[todayStr] || [];
      cleaned[todayStr] = [...todayMeds, { at: new Date().toISOString(), mins: durationMins, themeId: tid, themeLabel }];
      await setDoc(ref, { meditations: cleaned }, { merge: true });
      setTodayCount(c => c + 1);
    } catch { /* non-critical */ }
  }, [user]);

  // ── Begin session ──
  const beginSession = useCallback((phrases, secs, buffers, onComplete) => {
    phrasesRef.current    = phrases;
    timesRef.current      = phraseTimes(secs, phrases.length);
    spokenRef.current     = new Set();
    audioBuffsRef.current = buffers || [];

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    ambientRef.current  = startAmbient(sound, ctx);

    setTotalSecs(secs); setElapsed(0); setStep('session');

    if (phrases.length) {
      const buf = audioBuffsRef.current[0] || null;
      setTimeout(() => { showPhrase(phrases[0], buf, ctx); spokenRef.current.add(0); }, 2800);
    }

    intervalRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        timesRef.current.forEach((t, i) => {
          if (i > 0 && !spokenRef.current.has(i) && next >= t) {
            spokenRef.current.add(i);
            showPhrase(phrasesRef.current[i], audioBuffsRef.current[i] || null, audioCtxRef.current);
          }
        });
        if (next >= secs) {
          clearInterval(intervalRef.current);
          setTimeout(() => {
            stopSession(true);
            onComplete?.();
            setCompletionQuote(COMPLETION_QUOTES[Math.floor(Math.random() * COMPLETION_QUOTES.length)]);
            setStep('complete');
          }, 500);
        }
        return next;
      });
    }, 1000);
  }, [sound, showPhrase, stopSession]);

  // ── Handle start ──
  const handleStart = async () => {
    const isCustom = themeMode === 'custom';
    if (!isCustom && !themeId) { toast.error('Selecciona una temática'); return; }
    if (isCustom && !customText.trim()) { toast.error('Escribe sobre qué quieres meditar'); return; }

    setIsLoading(true);
    let rawPhrases = [];
    let themeLabel = 'Personalizado';
    const tid = isCustom ? 'custom' : themeId;

    try {
      const count = duration.mins <= 3 ? 4 : duration.mins <= 5 ? 7 : 12;
      if (isCustom) {
        const txt = await callClaude(
          `You are an expert and compassionate meditation guide. Generate exactly ${count} short phrases for a ${duration.mins}-minute guided meditation session on: "${customText.trim()}". Each phrase is 1-2 sentences max. In English, second person singular, calming and progressive (opening → depth → closing). Reply ONLY with the phrases, one per line, no numbering or bullets.`,
          520,
        );
        rawPhrases = txt.split('\n').map(l => l.trim()).filter(Boolean).slice(0, count);
      } else {
        const theme = findTheme(themeId);
        if (!theme) { toast.error('Selecciona una temática'); setIsLoading(false); return; }
        rawPhrases = selectPhrases(theme.phrases, duration.mins);
        themeLabel = theme.label;
      }

      const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
      const buffers = await Promise.all(rawPhrases.map(async (text) => {
        try {
          const b64 = await ttsSpeak(text);
          return await decodeBase64Audio(tmpCtx, b64);
        } catch { return null; }
      }));
      await tmpCtx.close();

      setIsLoading(false);
      setCompletedMeta({ mins: duration.mins, themeLabel });
      beginSession(rawPhrases, duration.secs, buffers, () => saveMeditation(themeLabel, duration.mins, tid));
    } catch {
      setIsLoading(false);
      toast.error('Error al iniciar la sesión');
    }
  };

  useEffect(() => () => {
    clearInterval(intervalRef.current);
    clearInterval(previewProgRef.current);
    clearTimeout(previewTimerRef.current);
    window.speechSynthesis?.cancel();
    try { audioCtxRef.current?.close(); } catch {}
    try { previewCtxRef.current?.close(); } catch {}
  }, []);

  const progress  = totalSecs ? elapsed / totalSecs : 0;
  const remaining = step === 'session' ? totalSecs - elapsed : duration.secs;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  // ── Active session ──────────────────────────────────────────────────────────
  if (step === 'session') {
    return (
      <div className="fixed inset-0 z-[100] meditation-bg flex flex-col items-center justify-center select-none">
        <div className="absolute left-0 right-0 h-0.5 bg-white/30" style={{ top: 'env(safe-area-inset-top)' }}>
          <div className="h-full bg-emerald-500/70 transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>
        <button
          onClick={() => stopSession(false)}
          className="absolute left-5 flex items-center gap-2 text-white/65 hover:text-white/95 transition-colors"
          style={{ top: 'calc(env(safe-area-inset-top) + 20px)' }}
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-base font-medium">Salir</span>
        </button>
        <p
          className="absolute right-5 text-white/50 text-base font-mono tracking-wider"
          style={{ top: 'calc(env(safe-area-inset-top) + 20px)' }}
        >{mm}:{ss}</p>

        <div className="flex flex-col items-center gap-10">
          <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }}>
            <div className="absolute rounded-full transition-all ease-in-out" style={{ width: 280, height: 280, background: 'rgba(110,231,183,0.08)', transform: `scale(${breathStep.scale})`, transitionDuration: `${breathStep.secs * 1000}ms` }} />
            <div className="absolute rounded-full transition-all ease-in-out" style={{ width: 230, height: 230, background: 'rgba(110,231,183,0.12)', transform: `scale(${breathStep.scale})`, transitionDuration: `${breathStep.secs * 1000}ms`, transitionDelay: '60ms' }} />
            <div
              className="absolute rounded-full transition-all ease-in-out flex items-center justify-center"
              style={{
                width: 160, height: 160,
                background: 'radial-gradient(circle at 38% 32%, rgba(167,243,208,0.85), rgba(52,211,153,0.70))',
                border: '1px solid rgba(167,243,208,0.5)',
                boxShadow: '0 0 70px rgba(52,211,153,0.35), 0 0 120px rgba(52,211,153,0.15), inset 0 1px 0 rgba(255,255,255,0.4)',
                transform: `scale(${breathStep.scale})`,
                transitionDuration: `${breathStep.secs * 1000}ms`,
                transitionDelay: '30ms',
              }}
            >
              <Wind className="w-9 h-9 text-white/70" />
            </div>
          </div>

          <p className="text-white/75 text-lg font-light tracking-[0.3em] uppercase">
            {breathStep.label}
          </p>

          <div className="px-10 text-center transition-all duration-700" style={{ opacity: phraseOn ? 1 : 0, transform: phraseOn ? 'translateY(0)' : 'translateY(10px)', minHeight: 72 }}>
            <p className="text-white/65 text-[15px] font-light leading-relaxed italic">"{phrase}"</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Completion ──────────────────────────────────────────────────────────────
  if (step === 'complete') {
    return (
      <div className="fixed inset-0 z-[100] meditation-bg flex flex-col items-center justify-center px-8 select-none">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'radial-gradient(circle, rgba(167,243,208,0.9), rgba(52,211,153,0.75))', boxShadow: '0 0 60px rgba(52,211,153,0.4)' }}>
            <span className="text-3xl">🧘</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Meditación completada</h2>
            {completedMeta && (
              <p className="text-sm text-white/60 mt-1">{completedMeta.mins} min · {completedMeta.themeLabel}</p>
            )}
          </div>
          <div className="liquid-glass-panel rounded-2xl px-6 py-5">
            <p className="text-violet-900/80 text-[15px] font-light leading-relaxed italic">"{completionQuote}"</p>
          </div>
          <button
            onClick={() => {
              setStep('setup'); setShowThemes(false); setElapsed(0);
              setPhrase(''); setPhraseOn(false);
              spokenRef.current = new Set(); audioBuffsRef.current = [];
            }}
            className="btn-primary px-8 py-3 rounded-xl text-sm font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="font-bold text-gray-900 dark:text-gray-100" style={{ fontSize: 30 }}>Meditación</h1>
        {todayCount > 0 && (
          <div className="flex items-center gap-3 mt-3 px-4 py-3 rounded-2xl bg-violet-50/80 dark:bg-violet-900/20 border border-violet-200/70 dark:border-violet-800/50">
            <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center flex-shrink-0 text-lg">🧘</div>
            <div>
              <p className="text-sm font-bold text-violet-700 dark:text-violet-300">
                {todayCount === 1 ? '1 sesión completada hoy' : `${todayCount} sesiones hoy`}
              </p>
              <p className="text-xs text-violet-500 dark:text-violet-400 mt-0.5">
                {todayCount >= 2 ? '¡Excelente práctica!' : 'Sigue construyendo el hábito'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── AV section (hidden when showThemes) ── */}
      <div style={{ display: showThemes ? 'none' : 'block' }} className="space-y-6">
        {/* Duration */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Duración</p>
          <div className="flex gap-2">
            {DURATIONS.map(d => (
              <button key={d.mins} onClick={() => setDuration(d)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                  duration.mins === d.mins
                    ? 'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
                }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sound */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Sonido ambiente</p>
          <div className="grid grid-cols-2 gap-2">
            {SOUNDS.map(s => {
              const isPreviewing  = previewId === s.id;
              const isSelected    = sound === s.id;
              const anyPreviewing = !!previewId;
              return (
                <div key={s.id} onClick={() => setSound(s.id)} role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSound(s.id)}
                  className={`relative rounded-2xl overflow-hidden transition-all border-2 cursor-pointer ${
                    isSelected ? 'border-emerald-400 ring-2 ring-emerald-300/50' : 'border-transparent'
                  }`}
                  style={{ height: 80 }}>
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }} />
                  <div className="absolute inset-0 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2.5">
                      <s.Icon className="w-5 h-5 text-white/90" />
                      <span className="text-sm font-semibold text-white">{s.label}</span>
                    </div>
                    {s.id !== 'none' && (
                      <div className="relative w-9 h-9 flex-shrink-0">
                        {isPreviewing && (
                          <svg
                            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                            viewBox="0 0 36 36"
                          >
                            <circle cx="18" cy="18" r={RING_R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
                            <circle
                              cx="18" cy="18" r={RING_R} fill="none"
                              stroke="white" strokeWidth="2.5" strokeLinecap="round"
                              strokeDasharray={RING_CIRC}
                              strokeDashoffset={RING_CIRC - (previewProgress / 100) * RING_CIRC}
                            />
                          </svg>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); isPreviewing ? stopPreview() : startPreview(s.id); }}
                          disabled={anyPreviewing && !isPreviewing}
                          className="absolute inset-0 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition-colors disabled:opacity-40"
                        >
                          {isPreviewing
                            ? <Square className="w-3 h-3 text-white fill-white" />
                            : <Play  className="w-3 h-3 text-white fill-white" />
                          }
                        </button>
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white/50" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => { setShowThemes(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2"
        >
          Continuar →
        </button>
      </div>

      {/* ── Theme section (hidden when !showThemes) ── */}
      <div style={{ display: showThemes ? 'block' : 'none' }} className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowThemes(false)} className="p-1 text-gray-400 hover:text-gray-600">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Escoge la temática</p>
        </div>

        {/* Toggle */}
        <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
          <button
            onClick={() => { setThemeMode('preset'); setThemeId(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              themeMode === 'preset'
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Prediseñadas
          </button>
          <button
            onClick={() => { setThemeMode('custom'); setThemeId(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              themeMode === 'custom'
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Personalizada
          </button>
        </div>

        {themeMode === 'preset' && (
          <div className="space-y-3">
            {/* Group grid */}
            <div className="grid grid-cols-2 gap-2">
              {THEME_GROUPS.map(group => (
                <button
                  key={group.id}
                  onClick={() => { setSelectedGroup(g => g === group.id ? null : group.id); setThemeId(null); }}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    selectedGroup === group.id
                      ? 'border-violet-400 bg-violet-50/70 dark:bg-violet-900/20 opacity-100'
                      : selectedGroup
                        ? 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 opacity-40'
                        : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50'
                  }`}
                >
                  <span className="text-2xl block mb-1">{group.emoji}</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-snug">{group.label}</span>
                </button>
              ))}
            </div>

            {/* Sub-themes */}
            {selectedGroup && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Elige un tema</p>
                {THEME_GROUPS.find(g => g.id === selectedGroup)?.themes.map(t => (
                  <button key={t.id} onClick={() => setThemeId(t.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      themeId === t.id
                        ? 'border-violet-400 bg-violet-50/60 dark:bg-violet-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50'
                    }`}>
                    <span className={`text-sm font-medium flex-1 ${themeId === t.id ? 'text-violet-800 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}`}>{t.label}</span>
                    {themeId === t.id && <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {themeMode === 'custom' && (
          <textarea
            className="input-field resize-none w-full"
            rows={4}
            placeholder="Ej. Quiero meditar sobre una discusión que tuve con mi pareja acerca de..."
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            autoFocus
          />
        )}

        <div className="px-4 py-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-center space-y-1">
          <p className="text-2xl">🎧</p>
          <p className="text-[14px] font-semibold text-amber-800 dark:text-amber-200">La voz guía está en inglés</p>
          <p className="text-[13px] text-amber-600 dark:text-amber-400 italic">"Para una experiencia de audio más natural y relajante"</p>
        </div>

        <button
          onClick={handleStart}
          disabled={isLoading || (themeMode === 'preset' && !themeId) || (themeMode === 'custom' && !customText.trim())}
          className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50 sticky bottom-4"
        >
          {isLoading
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Preparando sesión...</>
            : <><Wind className="w-5 h-5" /> Comenzar meditación</>
          }
        </button>
      </div>
    </div>
  );
};

export default Meditate;
