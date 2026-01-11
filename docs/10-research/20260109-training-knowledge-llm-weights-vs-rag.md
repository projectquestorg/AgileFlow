# Training Knowledge into LLM Weights vs RAG

**Import Date**: 2026-01-09
**Topic**: Training Knowledge into LLM Weights vs RAG
**Source**: Conference talk transcript (November 2025)
**Content Type**: transcript

---

## Summary

This talk presents a compelling argument for training domain knowledge directly into LLM weights as an alternative to RAG (Retrieval Augmented Generation). The speaker (a PhD researcher who has started a company in this space) systematically analyzes three approaches to teaching LLMs domain-specific knowledge: (1) full context - cramming everything into the prompt, (2) RAG - retrieving relevant chunks via embeddings, and (3) training into weights - actually fine-tuning the model to know your data.

The core thesis is that while RAG is easy and works "okay," it has fundamental limitations that prevent it from ever being great. Full context is limited by the quadratic attention cost of transformers and "context broad" - models get worse as context grows even with relevant information present. Training into weights, though more expensive upfront, offers the promise of models that truly understand your domain data and can reason across it, with cheap inference afterwards.

The talk covers practical techniques for training knowledge into weights without "bricking" the model through catastrophic forgetting: synthetic data generation to expand small datasets, and parameter-efficient fine-tuning methods (LoRA, prefix tuning, memory layers) that update only a small portion of the model.

---

## Key Findings

### Three Approaches to LLM Knowledge Injection

1. **Full Context**: Paste everything into the prompt
   - Works for small datasets (~100 documents)
   - Problems: Expensive, slow (10x slowdown at 128k tokens), quadratic attention cost
   - "Context broad" - models degrade as context grows even with relevant info
   - Claude performs best but still degrades significantly at 10k+ tokens

2. **RAG (Retrieval Augmented Generation)**: Retrieve relevant chunks via embeddings
   - Easy to implement (5 lines of code)
   - Fundamental limitations:
     - Embeddings are not adaptive to your domain (Visa/Mastercard clustering problem)
     - Security vulnerability: 90% of text can be recovered from embeddings
     - Cannot reason across multiple documents or handle implied questions
     - Chunking problems: "no matter how you chunk, you'll never get everything you need"

3. **Training into Weights**: Fine-tune the model on your data
   - Most expensive upfront, cheapest at inference
   - Key insight: "models have fixed capacity" (~3.6 bits per parameter)
   - Goal: Replace irrelevant knowledge (capital of Tajikistan's smallest province) with domain knowledge

### Why Naive Fine-Tuning Fails

The "dumbest approach" of training directly on documents causes catastrophic forgetting:
- Model memorizes perfectly but can't generalize
- Asked to write a poem about 3M, model outputs: "The passage of a passage is a poem. End of sentence."
- Model becomes "obsessed" with training data and loses general capabilities

### Synthetic Data Generation: The Solution

Generate large synthetic datasets from small real datasets:
- **Synthetic Continued Pre-training** (Stanford): Extract entities, generate diverse Q&A pairs
- Can outperform GPT-4 on domain tasks with 100M-1B synthetic tokens
- "Breaks the conventional ML paradigm" - no more data scarcity problem
- Key papers: Active Reading, Self-Study, Rephrasing the Web
- **SEAL (Self-Adapting Language Models)**: Model generates its own training data to improve

### Parameter-Efficient Fine-Tuning Methods

To avoid catastrophic forgetting, update only a small portion of the model:

| Method | Description | Trade-offs |
|--------|-------------|------------|
| **Full Fine-Tuning** | Update all parameters | High capacity, high forgetting |
| **LoRA** | Train small low-rank matrices | "Learns less, forgets less" |
| **Prefix Tuning** | Train KV cache | Well-supported, conflicting evidence |
| **Memory Layers** | Differentiable lookup tables | Best forgetting/learning ratio in some studies |
| **Mixture of Experts** | Add new expert to MLP | Scalable, can be optionally routed |

### Key Research Findings

- **LoRA for RL**: Thinking Machines shows LoRA is as good as full fine-tuning for RL
- **Tiny LoRA**: Speaker's research achieved 91% accuracy on GSM8K with only 14 parameters trained
- **One Parameter Experiment**: 5% improvement with literally one trainable parameter
- **RL vs SFT**: RL requires ~1000x fewer parameters than SFT because the learning signal is sparse (1 bit vs cross-entropy on all tokens)

### When to Use Each Approach

| Scenario | Recommended Approach |
|----------|---------------------|
| Data changes frequently | RAG (or inference-time approaches like Deep Research) |
| Large static dataset | Training into weights |
| Small dataset | Full context or RAG |
| Need reasoning across documents | Training into weights |
| Budget-constrained | RAG |

---

## Implementation Approach

### For Training Knowledge into Weights

1. **Generate Synthetic Data**
   - Use LLM to extract entities from your documents
   - Generate diverse Q&A pairs, paraphrases, and scenarios
   - Target 100M+ tokens for meaningful improvement

2. **Choose Parameter-Efficient Method**
   - **LoRA**: Good default, especially for RL training
   - **Prefix Tuning**: If you need KV cache compatibility
   - **Memory Layers**: If forgetting is critical concern

3. **Serve Personalized Models**
   - Use batched LoRA inference (Tinker API pattern)
   - Share base model across users
   - Store only small adapters per user (~megabytes)

---

## Code Snippets

No code snippets were present in this transcript (conference talk format).

---

## Action Items

- [ ] Research synthetic data generation pipelines for domain adaptation
- [ ] Evaluate LoRA vs prefix tuning vs memory layers for our use case
- [ ] Explore Thinking Machines' Tinker API for personalized model serving
- [ ] Read "Synthetic Continued Pre-training" paper (Stanford)
- [ ] Read "Learns Less and Forgets Less" paper
- [ ] Investigate SEAL (Self-Adapting Language Models)
- [ ] Monitor Daytology for high-quality synthetic data generation

---

## Risks & Gotchas

- **Temporal updates**: How to handle data that changes over time is unsolved
- **Adversarial data**: Training on user data creates security risks
- **Conflicting information**: Same problem as RAG when source data conflicts
- **Still need RAG**: "There's basically no scenario... where you're just always training and never doing RAG"
- **Expensive upfront**: Training costs are front-loaded vs RAG's per-query costs
- **Research maturity**: "This part of the talk is getting close to purely speculative"

---

## Key Quotes

> "I think embeddings are the file system of today. And they're not the file system of the future."

> "The model can perfectly memorize this entire 3M 10K financial report... [but asked for a poem] it says 'The passage of a passage is a poem. End of sentence.'"

> "Even though you don't have a lot of data, if you're willing to generate like a large synthetic data set that describes the data you have, you can actually train a model on it and it works really well."

> "RL just gives you a one or a zero... So I think because RL is like so sparse and information efficient, then you can do it with way fewer parameters."

> "I'm not saying that it's best to store information in weights. I guess I'm arguing that that gets you a lot and we're not using it right now."

---

## Story Suggestions

### Potential Epic: Domain-Adaptive LLM System

**US-XXXX**: Research synthetic data generation for AgileFlow documentation
- AC: Generate Q&A pairs from existing docs, evaluate quality

**US-XXXX**: Prototype LoRA fine-tuning pipeline
- AC: Fine-tune small model on AgileFlow patterns, measure improvement

**US-XXXX**: Evaluate prefix tuning vs LoRA for our use case
- AC: Compare forgetting/learning trade-offs, document findings

---

## References

- Chroma "Context Broad" report - Performance degradation with context length
- "Synthetic Continued Pre-training" - Stanford paper on synthetic data generation
- "Learns Less and Forgets Less" - LoRA vs full fine-tuning comparison
- SEAL (Self-Adapting Language Models) - Self-improving via synthetic data
- Thinking Machines Tinker API - Personalized model serving with batched LoRA
- Daytology - High-quality synthetic data generation company
- Speaker's upcoming paper on Tiny LoRA (legal clearance pending)
