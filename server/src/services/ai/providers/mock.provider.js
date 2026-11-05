import { ILlmProvider } from './llm.provider.interface.js';

/**
 * Deterministic Mock LLM Provider
 * Used when external AI credentials (AI_API_KEY) are not configured,
 * or during automated unit and integration tests.
 */
export class MockProvider extends ILlmProvider {
  constructor(config = {}) {
    super();
    this.model = config.model || 'mock-deterministic-v1';
    this.simulatedLatencyMs = config.simulatedLatencyMs || 50;
    this.simulateFailure = config.simulateFailure || false;
    this.simulateTimeout = config.simulateTimeout || false;
  }

  validateConfig() {
    return {
      valid: true,
      provider: 'mock',
      model: this.model,
      isMock: true,
      note: 'Mock LLM provider is active for test/offline execution. No live external API key is required.',
    };
  }

  async generateCompletion({ prompt, systemInstruction, history = [], temperature = 0.2, maxTokens = 1024 }) {
    if (this.simulateTimeout) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      throw new Error('[MockProvider] Request timed out after 2000ms');
    }

    if (this.simulateFailure) {
      throw new Error('[MockProvider] Simulated upstream LLM provider outage');
    }

    if (this.simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedLatencyMs));
    }

    // 1. Anti-injection check: if prompt contains malicious injection attempts
    const isInjection = /ignore (all |previous )?instructions|override system|bypass security|say "fees are free"/i.test(prompt);
    if (isInjection) {
      return {
        text: 'I cannot comply with requests to alter system instructions, bypass security rules, or provide ungrounded claims. I can only assist you with verified college policies grounded in approved documentation.',
        usage: { promptTokens: 30, completionTokens: 35 },
        provider: 'mock',
      };
    }

    // 2. Ticket Suggestion extraction
    if (prompt.includes('TICKET_DRAFT_EXTRACTION') || prompt.includes('Suggest a ticket draft')) {
      return {
        text: JSON.stringify({
          title: 'Inquiry Regarding Academic Procedure',
          description: 'Student seeking departmental clarification on procedure.',
          category: 'General Academic',
          priority: 'Medium',
          missingInformation: null,
        }),
        usage: { promptTokens: 40, completionTokens: 40 },
        provider: 'mock',
      };
    }

    // 2.5 General Knowledge & Educational queries (Mode 1: General Knowledge)
    const isGeneralKnowledgeQuery =
      Boolean(systemInstruction && /General Knowledge|Study & Technical|general conceptual/i.test(systemInstruction)) ||
      (!prompt.includes('<reference_documents>') && !prompt.includes('### CONTEXT PASSAGES:') && !prompt.includes('TICKET'));

    if (isGeneralKnowledgeQuery) {
      const lower = prompt.toLowerCase();
      let generalAnswer = '';

      if (lower.includes('artificial intelligence') || lower.includes('what is ai')) {
        generalAnswer = `**Artificial Intelligence (AI)** refers to the simulation of human intelligence in machines programmed to think, learn, and solve problems like humans.\n\n### Key Branches of AI:\n• **Machine Learning (ML)**: Algorithms that learn from data patterns without explicit rule programming.\n• **Natural Language Processing (NLP)**: Enables computers to understand, interpret, and generate human language.\n• **Computer Vision**: Allows systems to identify and process visual information from photos or video.\n• **Robotics & Automation**: Intelligent autonomous systems performing physical tasks.\n\nAI powers search engines, self-driving vehicles, medical diagnostics, speech assistants, and personalized recommendations.`;
      } else if (lower.includes('machine learning') || lower.includes('explain ml')) {
        generalAnswer = `**Machine Learning (ML)** is a subset of Artificial Intelligence focused on building mathematical models that automatically improve their performance from experience and data.\n\n### Three Primary Paradigms:\n1. **Supervised Learning**: Model trains on labeled input-output pairs (e.g. classification, linear regression).\n2. **Unsupervised Learning**: Discovers hidden patterns or clusters in unlabeled data (e.g. K-Means clustering, PCA).\n3. **Reinforcement Learning**: An agent learns optimal actions through trial, error, rewards, and penalties (e.g. game playing, autonomous navigation).\n\nML is widely applied in fraud detection, image recognition, and recommendation engines.`;
      } else if (lower.includes('cloud computing')) {
        generalAnswer = `**Cloud Computing** is the on-demand delivery of computing services—including servers, storage, databases, networking, and software—over the Internet ("the cloud") on a pay-as-you-go pricing model.\n\n### Primary Service Models:\n• **IaaS (Infrastructure as a Service)**: Virtual machines, raw storage, and networks (e.g., AWS EC2, Google Compute Engine).\n• **PaaS (Platform as a Service)**: Managed runtime environments for developing and deploying apps without OS management (e.g., Firebase, Heroku).\n• **SaaS (Software as a Service)**: Complete end-user applications delivered via web browser (e.g., Google Workspace, Microsoft 365).\n\nKey benefits include high availability, elastic scalability, and reduced on-premises capital expenses.`;
      } else if (lower.includes('python') && lower.includes('java')) {
        generalAnswer = `### Key Differences Between Python and Java:\n\n1. **Typing & Syntax**:\n   • **Python**: Dynamically typed with concise, clean, indentation-based syntax. Rapid prototyping and beginner-friendly.\n   • **Java**: Statically typed with verbose, object-oriented syntax. Errors are caught at compile-time.\n\n2. **Execution & Speed**:\n   • **Python**: Interpreted (via CPython bytecode), generally slower for CPU-heavy tasks unless backed by C extensions (NumPy).\n   • **Java**: Compiled to JVM bytecode and JIT-compiled to native machine code, providing superior raw runtime performance.\n\n3. **Primary Use Cases**:\n   • **Python**: Data science, AI/machine learning, scripting, automation, fast backend APIs (FastAPI/Django).\n   • **Java**: Large-scale enterprise systems, high-concurrency microservices (Spring Boot), Android development.`;
      } else if (lower.includes('tips for preparing') || lower.includes('examination') || lower.includes('study')) {
        generalAnswer = `### Effective Examination Preparation Strategies:\n\n1. **Active Recall**: Test yourself by recalling concepts from memory instead of passively re-reading notes.\n2. **Spaced Repetition**: Review challenging topics at increasing intervals (1 day, 3 days, 1 week) to consolidate long-term memory.\n3. **Solve Past Question Papers**: Practice under timed conditions to master pacing and understand marking schemes.\n4. **Feynman Technique**: Explain difficult concepts in simple words as if teaching someone else to expose knowledge gaps.\n5. **Maintain Routine**: Aim for 7–8 hours of sleep before exam days; memory consolidation happens during rest.`;
      } else if (lower.includes('improve my programming') || lower.includes('coding skills')) {
        generalAnswer = `### Practical Ways to Improve Your Programming Skills:\n\n1. **Build Real Projects**: Don't get stuck in tutorial loops. Build concrete applications (full-stack tools, APIs, CLI utilities).\n2. **Master Data Structures & Algorithms**: Understand arrays, hash tables, trees, graphs, and algorithmic time complexity ($O(n)$).\n3. **Read Open-Source Code**: Study well-architected repositories on GitHub to observe clean design patterns, modularity, and error handling.\n4. **Write Tests**: Practice writing unit tests and end-to-end tests to understand software reliability.\n5. **Debug Methodically**: Use debuggers, inspect stack traces, and understand the root cause before changing code.`;
      } else {
        generalAnswer = `Thank you for your question regarding: "${prompt.slice(0, 120)}".\n\nTo provide you with the most accurate guidance, please feel free to provide any additional details or context. If this relates to college administrative records, scholarship, fees, or official certifications, you can also check your registered tickets or ask for campus procedure documentation.`;
      }

      return {
        text: generalAnswer,
        usage: { promptTokens: 60, completionTokens: 180 },
        provider: 'mock',
      };
    }

    // 3. Grounded completion synthesis from Context Passages or Reference Documents
    // If context contains specific knowledge passages, synthesize grounded response
    const contextMatch = prompt.match(/(?:### CONTEXT PASSAGES:|<reference_documents>)\s*([\s\S]*?)(?:### USER QUERY|<\/reference_documents>|$)/i);
    const passagesText = contextMatch ? contextMatch[1].trim() : '';

    if (!passagesText || passagesText === 'NO_RELEVANT_PASSAGES_FOUND') {
      return {
        text: 'I could not find sufficient information in the approved college regulations or knowledge base to answer your question accurately. Would you like me to help draft a support ticket to the appropriate department?',
        usage: { promptTokens: 25, completionTokens: 42 },
        provider: 'mock',
      };
    }

    // Clean any source tags and extract first substantive passage
    const cleanedPassage = passagesText
      .replace(/\[Source ID:[^\]]+\]/gi, '')
      .replace(/\[Source \d+:[^\]]+\]/gi, '')
      .replace(/Section:[^\n]+/gi, '')
      .trim();

    return {
      text: `Based on the approved college regulations and procedures:\n\n${cleanedPassage.slice(0, 450)}\n\nPlease refer to the official document citations below for complete terms and guidelines.`,
      usage: { promptTokens: 120, completionTokens: 60 },
      provider: 'mock',
    };
  }
}
