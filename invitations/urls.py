from django.urls import path
from .views import SendInvitationAPIView, JoinTeamAPIView, ListUserInvitationsAPIView

urlpatterns = [
    path('api/send-invitation/', SendInvitationAPIView.as_view(), name='send-invitation'),
    path('api/join-team/<int:invitation_id>/', JoinTeamAPIView.as_view(), name='join-team'),
    path('api/invitations/', ListUserInvitationsAPIView.as_view(), name='list-user-invitations'),
]
