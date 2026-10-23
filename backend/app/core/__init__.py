# app/core/__init__.py
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Core AI pipeline
from app.core import ContextBuilder, PromptBuilder, LLMGateway, CitationEngine, ConversationStore, QueryRewriter, StructureService

# API endpoints
from app.api import deps

# Utility functions
from app.utils import hotspotsanalytics

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure static files
app static=StaticFiles(directory="static", url_prefix="/static")

# Define the core AI pipeline
class AIAssistant:
    def __init__(self, context_builder, prompt_builder, llm_gateway, citation_engine, conversation_store, query_rewriter, structure_service, settings):
        self.context_builder = context_builder
        self.prompt_builder = prompt_builder
        self.llm_gateway = llm_gateway
        self.citation_engine = citation_engine
        self.conversation_store = conversation_store
        self.query_rewriter = query_rewriter
        self.structure_service = structure_service
        self.settings = settings

    def process_user_input(self, user_input):
        # Build context
        context = self.context_builder.build_context(user_input)

        # Build prompt
        prompt = self.prompt_builder.build_prompt(context)

        # Process prompt
        response = self.llm_gateway.process_prompt(prompt)

        # Handle citation requests
        citations = self.citation_engine.handle_citations(response)

        # Store conversation data
        self.conversation_store.store_conversation(response)

        # Rewrite query
        query = self.query_rewriter.rewrite_query(response)

        # Handle structure requests
        structure = self.structure_service.handle_structure(query)

        # Return response
        return JSONResponse(content=response, media_type="application/json")

# Define the API endpoints
from app.api import deps

# Create the AI assistant
ai_assistant = AIAssistant(
    context_builder=ContextBuilder(),
    prompt_builder=PromptBuilder(),
    llm_gateway=LLMGateway(),
    citation_engine=CitationEngine(),
    conversation_store=ConversationStore(),
    query_rewriter=QueryRewriter(),
    structure_service=StructureService(),
    settings=settings,
)

# Define the API endpoints
from app.api import deps

# API endpoints
from app.api import deps

# Utility functions
from app.utils import hotspotsanalytics