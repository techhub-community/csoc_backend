from django.contrib import messages
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated


from .models import CustomUser
from .serializers import UserRegistrationSerializer, UserListSerializer


class UserRegistrationAPIView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]
 

class ListUsersAPIView(generics.ListAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserListSerializer
    permission_classes = [IsAuthenticated]

# class DashboardView(TemplateView, LoginRequiredMixin):
#     template_name = 'dashboard.html'

#     def get_context_data(self, **kwargs):
#         context = super().get_context_data(**kwargs)
#         if self.request.user.role == 'mentee':
#             context['teams'] = Membership.objects.filter(user=self.request.user)
#             context['invitations'] = Invitation.objects.filter(receiver=self.request.user, status='pending')
#         elif self.request.user.role == 'mentor':
#             context['mentees'] = Membership.objects.filter(team__memberships__user=self.request.user, role='mentee')
#         return context


# class UserRegistrationView(FormView):
#     template_name = 'registration.html'
#     form_class = UserRegistrationForm
#     success_url = reverse_lazy('dashboard')

#     def form_valid(self, form):
#         form.save()
#         return super().form_valid(form)


# class UserLoginView(SuccessMessageMixin, LoginView):
#     template_name = 'login.html'
#     form_class = LoginForm


# class UserLogoutView(LogoutView):
#     def dispatch(self, request, *args , **kwargs ):
#         if request.user.is_authenticated:
#             messages.success(
#                 request, f"{request.user.first_name} successfully logged out"
#             )
#         else:
#             messages.warning(request, "You are not logged in. Please login first!")
#             return redirect("login")
#         return super().dispatch(request, *args, **kwargs)