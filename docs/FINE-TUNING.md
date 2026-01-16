# LLM Fine-Tuning Guide

Fine-tune a LoRA adapter on your anomaly analysis training data.

## Prerequisites

```bash
# Install Axolotl (LoRA fine-tuning tool)
pip install axolotl

# Or use Docker
docker pull winglian/axolotl:main-latest
```

## Step 1: Export Training Data

```bash
# Export from the app
curl http://localhost:5000/api/monitor/training/export > training-data.jsonl

# Check count
wc -l training-data.jsonl
# Should be 100+ for good results
```

## Step 2: Prepare Data Format

Axolotl expects this format:
```json
{"instruction": "...", "input": "", "output": "..."}
```

Convert with this script:
```bash
node scripts/convert-training-data.js
```

## Step 3: Training Config

Create `axolotl-config.yaml`:

```yaml
base_model: meta-llama/Llama-3.2-1B-Instruct
model_type: LlamaForCausalLM
tokenizer_type: AutoTokenizer

load_in_8bit: true
adapter: lora
lora_r: 16
lora_alpha: 32
lora_dropout: 0.05
lora_target_modules:
  - q_proj
  - v_proj
  - k_proj
  - o_proj

datasets:
  - path: training-data-axolotl.jsonl
    type: completion

output_dir: ./lora-anomaly-analyzer

# Training params
micro_batch_size: 2
gradient_accumulation_steps: 4
num_epochs: 3
learning_rate: 2e-4
warmup_ratio: 0.1

# Eval
val_set_size: 0.05
```

## Step 4: Run Training

```bash
# With Axolotl
accelerate launch -m axolotl.cli.train axolotl-config.yaml

# Or with Docker
docker run --gpus all -v $(pwd):/workspace winglian/axolotl:main-latest \
  accelerate launch -m axolotl.cli.train /workspace/axolotl-config.yaml
```

Training takes ~30 min on RTX 3080 for 100 examples.

## Step 5: Merge & Quantize

```bash
# Merge LoRA into base model
python -m axolotl.cli.merge_lora axolotl-config.yaml

# Quantize for Ollama (GGUF format)
python -m llama.cpp.convert_hf_to_gguf.py ./lora-anomaly-analyzer --outfile anomaly-analyzer.gguf
```

## Step 6: Deploy to Ollama

```bash
# Create Modelfile
cat > Modelfile << 'EOF'
FROM ./anomaly-analyzer.gguf
PARAMETER temperature 0.7
PARAMETER repeat_penalty 1.3
SYSTEM You are an expert in distributed systems observability for a crypto exchange.
EOF

# Import to Ollama
ollama create anomaly-analyzer -f Modelfile

# Test
ollama run anomaly-analyzer "Analyze: exchange-api GET 500ms, CPU 0.1%"
```

## Step 7: Update App Config

```bash
# Set environment variable
export OLLAMA_MODEL=anomaly-analyzer

# Or update docker-compose.yml
OLLAMA_MODEL: anomaly-analyzer
```

## Tips

- **100+ examples minimum** for noticeable improvement
- **Balance good/bad** - aim for 70% good, 30% bad with corrections
- **Diverse services** - include all your services in training data
- **Retrain monthly** - as your system evolves, collect more data
