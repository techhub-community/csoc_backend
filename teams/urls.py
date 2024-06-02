from django.urls import path
from .views import ListCreateTeamAPIView


app_name = "teams"


urlpatterns = [
    path('api/team/', ListCreateTeamAPIView.as_view(), name='list_create_teams'),
]
